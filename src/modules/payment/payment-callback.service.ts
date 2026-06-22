import type { PaymentInvoice, PaymentInvoiceType as PaymentInvoiceTypeModel } from "@prisma/client";
import { PaymentInvoiceType } from "@prisma/client";
import { prisma } from "../../services/prisma";
import { eventBus } from "../../services/event-bus.service";
import { MonitoringService } from "../../services/monitoring.service";
import { AdminService } from "../admin/admin.service";
import { assertInvoiceAmountIntegrity } from "./payment-amounts";
import { audit } from "./payment-repository";
import { paymentLog } from "./payment-logging";
import { redactPaymentMetadata } from "./payment-redaction";

const ALREADY_PROCESSED_FA = "⚠️ این پرداخت قبلاً پردازش شده است.";

export type CallbackReference = { token?: string; invoice?: string; invoice_id?: string; pay_id?: string };

type CallbackDeps = {
  existingCompletedResult(invoiceId: string): Promise<any | null>;
  finalizePaidProductPurchase(data: { userId: string; productId: string; invoiceId?: string; paymentSource: "GATEWAY"; couponCode?: string | null }): Promise<any>;
  fulfillPaidInvoice(invoiceId: string): Promise<any>;
  provisionXrayClient(orderId: string, invoiceId?: string): Promise<any>;
  walletTopupNotificationPayload(invoice: Pick<PaymentInvoice, "id" | "userId" | "amount">, user: { balance: number }): any;
  productCallbackResult(invoice: Pick<PaymentInvoice, "id" | "userId" | "amount">, purchaseResult: any): Promise<any>;
};

function isValidObjectId(value: string) {
  return /^[a-f\d]{24}$/i.test(value);
}

function normalizeCallbackReference(reference: string | CallbackReference) {
  if (typeof reference === "string") return { invoice_id: reference.trim() };
  return {
    token: reference.token?.trim(),
    invoice: reference.invoice?.trim(),
    invoice_id: reference.invoice_id?.trim(),
    pay_id: reference.pay_id?.trim(),
  };
}

async function findInvoiceByCallbackReference(reference: string | CallbackReference) {
  const normalized = normalizeCallbackReference(reference);
  if (normalized.token) {
    const byToken = await prisma.paymentInvoice.findUnique({ where: { callbackToken: normalized.token } });
    if (byToken) return { invoice: byToken, matchedBy: "callbackToken" };
  }

  if (normalized.invoice && isValidObjectId(normalized.invoice)) {
    const byInvoice = await prisma.paymentInvoice.findUnique({ where: { id: normalized.invoice } });
    if (byInvoice) return { invoice: byInvoice, matchedBy: "invoice" };
  }

  if (normalized.invoice_id) {
    const byLegacyToken = await prisma.paymentInvoice.findUnique({ where: { callbackToken: normalized.invoice_id } });
    if (byLegacyToken) return { invoice: byLegacyToken, matchedBy: "legacyToken" };
    if (isValidObjectId(normalized.invoice_id)) {
      const byLegacyInvoice = await prisma.paymentInvoice.findUnique({ where: { id: normalized.invoice_id } });
      if (byLegacyInvoice) return { invoice: byLegacyInvoice, matchedBy: "legacyInvoice" };
    }
    const byPayId = await prisma.paymentInvoice.findFirst({ where: { payId: normalized.invoice_id } });
    if (byPayId) return { invoice: byPayId, matchedBy: "payId" };
  }

  if (normalized.pay_id) {
    const byPayId = await prisma.paymentInvoice.findFirst({ where: { payId: normalized.pay_id } });
    if (byPayId) return { invoice: byPayId, matchedBy: "payId" };
  }

  return null;
}

export class PaymentCallbackService {
  static async completePayment(reference: string | CallbackReference, metadata: Record<string, unknown> = {}, deps: CallbackDeps) {
    const safeMetadata = redactPaymentMetadata(metadata);
    const normalizedReference = normalizeCallbackReference(reference);
    const safeReference = redactPaymentMetadata(normalizedReference);
    if (!normalizedReference.token && !normalizedReference.invoice && !normalizedReference.invoice_id && !normalizedReference.pay_id) {
      paymentLog("PAYMENT_CALLBACK_REJECTED", { reason: "missing_callback_reference", query: safeMetadata.query });
      await prisma.auditLog.create({
        data: {
          actorId: "system",
          action: "PAYMENT_CALLBACK_REJECTED",
          metadata: JSON.stringify({ reason: "missing_callback_reference", ...safeMetadata }),
        },
      });
      MonitoringService.record({
        type: "PAYMENT_CALLBACK_FAILED",
        section: "Payment Callback",
        description: "Missing callback reference",
        severity: "critical",
        suggestedAction: "پارامترهای callback درگاه را بررسی کنید.",
        metadata: safeMetadata,
      });
      return { statusCode: 400, text: "Invalid payment callback." };
    }

    const resolved = await findInvoiceByCallbackReference(normalizedReference);
    if (!resolved) {
      paymentLog("PAYMENT_CALLBACK_REJECTED", { reason: "invoice_not_found", reference: safeReference, query: safeMetadata.query });
      await prisma.auditLog.create({
        data: {
          actorId: "system",
          action: "PAYMENT_CALLBACK_REJECTED",
          metadata: JSON.stringify({ reason: "invoice_not_found", reference: safeReference, ...safeMetadata }),
        },
      });
      MonitoringService.record({
        type: "PAYMENT_CALLBACK_FAILED",
        section: "Payment Callback",
        description: "Payment invoice not found",
        severity: "critical",
        suggestedAction: "ارسال invoice_id/token/pay_id از سمت درگاه را بررسی کنید.",
        metadata: { reference: safeReference, ...safeMetadata },
      });
      return { statusCode: 404, text: "Payment invoice not found." };
    }
    const invoice = resolved.invoice;

    const callbackAt = new Date();
    await prisma.paymentInvoice.update({ where: { id: invoice.id }, data: { callbackCount: { increment: 1 }, lastCallbackAt: callbackAt } });
    paymentLog("PAYMENT_CALLBACK_RECEIVED", {
      invoiceId: invoice.id,
      userId: invoice.userId,
      status: invoice.status,
      matchedBy: resolved.matchedBy,
      callbackAt: callbackAt.toISOString(),
      query: safeMetadata.query,
    });
    await audit(prisma, {
      userId: invoice.userId,
      invoiceId: invoice.id,
      action: "PAYMENT_CALLBACK_RECEIVED",
      metadata: { reference: safeReference, matchedBy: resolved.matchedBy, ...safeMetadata },
    });

    const integrity = assertInvoiceAmountIntegrity(invoice);
    if (!integrity.ok) {
      const failed = await prisma.paymentInvoice.updateMany({
        where: { id: invoice.id, status: "PENDING" },
        data: { status: "FAILED", verifiedAt: new Date(), deliveryStatus: "FAILED" },
      });
      paymentLog("PAYMENT_PROCESS_FAILED", {
        invoiceId: invoice.id,
        userId: invoice.userId,
        stage: "callback_security",
        reason: integrity.reason,
        statusChanged: failed.count === 1,
      });
      await audit(prisma, {
        userId: invoice.userId,
        invoiceId: invoice.id,
        action: "PAYMENT_PROCESS_FAILED",
        metadata: {
          stage: "callback_security",
          reason: integrity.reason,
          gatewayAmount: invoice.gatewayAmount,
          amount: invoice.amount,
          originalAmount: invoice.originalAmount,
          discountAmount: invoice.discountAmount,
          amountExpected: integrity.expectedAmount,
        },
      });
      MonitoringService.record({
        type: "PAYMENT_CALLBACK_FAILED",
        section: "Payment Callback",
        description: `Invoice amount mismatch: ${integrity.reason}`,
        userId: invoice.userId,
        severity: "critical",
        suggestedAction: "مبلغ فاکتور و مقدار برگشتی درگاه را بررسی کنید.",
        metadata: { invoiceId: invoice.id },
      });
      return {
        statusCode: 409,
        text: "Invoice amount mismatch.",
        failed: { invoice: { ...invoice, status: failed.count === 1 ? "FAILED" : invoice.status }, type: invoice.type as PaymentInvoiceTypeModel },
      };
    }

    if (normalizedReference.pay_id && invoice.payId && normalizedReference.pay_id !== invoice.payId) {
      paymentLog("PAYMENT_CALLBACK_REJECTED", {
        invoiceId: invoice.id,
        userId: invoice.userId,
        reason: "pay_id_mismatch",
        expectedPayId: invoice.payId,
        receivedPayId: normalizedReference.pay_id,
      });
      await audit(prisma, {
        userId: invoice.userId,
        invoiceId: invoice.id,
        action: "PAYMENT_CALLBACK_REJECTED",
        metadata: {
          reason: "pay_id_mismatch",
          expectedPayId: invoice.payId,
          receivedPayId: normalizedReference.pay_id,
          reference: safeReference,
        },
      });
      MonitoringService.record({
        type: "PAYMENT_CALLBACK_FAILED",
        section: "Payment Callback",
        description: "pay_id mismatch",
        userId: invoice.userId,
        severity: "critical",
        suggestedAction: "احتمال callback اشتباه یا دستکاری شده را بررسی کنید.",
        metadata: { invoiceId: invoice.id, expectedPayId: invoice.payId, receivedPayId: normalizedReference.pay_id },
      });
      return { statusCode: 409, text: "Payment callback pay_id mismatch." };
    }

    if (normalizedReference.pay_id && !invoice.payId) {
      const duplicate = await prisma.paymentInvoice.findFirst({
        where: { payId: normalizedReference.pay_id, NOT: { id: invoice.id } },
        select: { id: true, userId: true, status: true },
      });
      if (duplicate) {
        paymentLog("PAYMENT_CALLBACK_REJECTED", {
          invoiceId: invoice.id,
          userId: invoice.userId,
          reason: "duplicate_callback_pay_id",
          payId: normalizedReference.pay_id,
          duplicateInvoiceId: duplicate.id,
        });
        await audit(prisma, {
          userId: invoice.userId,
          invoiceId: invoice.id,
          action: "PAYMENT_GATEWAY_DUPLICATE_PAY_ID",
          metadata: {
            source: "callback",
            payId: normalizedReference.pay_id,
            duplicateInvoiceId: duplicate.id,
            duplicateUserId: duplicate.userId,
            duplicateStatus: duplicate.status,
          },
        });
        MonitoringService.record({
          type: "PAYMENT_DUPLICATE_CALLBACK",
          section: "Payment Callback",
          description: `Duplicate callback pay_id: ${normalizedReference.pay_id}`,
          userId: invoice.userId,
          severity: "critical",
          suggestedAction: "pay_id تکراری در درگاه را فوری بررسی کنید.",
          metadata: { invoiceId: invoice.id, duplicateInvoiceId: duplicate.id },
        });
        return { statusCode: 409, text: "Duplicate gateway pay_id." };
      }
    }

    paymentLog("PAYMENT_CALLBACK_PROCESSING", { invoiceId: invoice.id, userId: invoice.userId, status: invoice.status, type: invoice.type });
    await audit(prisma, {
      userId: invoice.userId,
      invoiceId: invoice.id,
      action: "PAYMENT_CALLBACK_PROCESSING",
      metadata: { status: invoice.status, type: invoice.type, payId: invoice.payId },
    });
    paymentLog("PAYMENT_CALLBACK_VALIDATED", { invoiceId: invoice.id, userId: invoice.userId, status: invoice.status, type: invoice.type });
    await audit(prisma, {
      userId: invoice.userId,
      invoiceId: invoice.id,
      action: "PAYMENT_CALLBACK_VALIDATED",
      metadata: { status: invoice.status, type: invoice.type },
    });

    const deliveryRetryable =
      invoice.status === "PAID" &&
      (invoice.deliveryStatus === null || invoice.deliveryStatus === "PENDING" || invoice.deliveryStatus === "FAILED_DELIVERY");
    if (invoice.status === "COMPLETED" || (invoice.status === "PAID" && !deliveryRetryable)) {
      paymentLog("PAYMENT_DUPLICATE_CALLBACK_IGNORED", {
        invoiceId: invoice.id,
        userId: invoice.userId,
        status: invoice.status,
        deliveryStatus: invoice.deliveryStatus,
      });
      await audit(prisma, {
        userId: invoice.userId,
        invoiceId: invoice.id,
        action: "PAYMENT_DUPLICATE_CALLBACK_IGNORED",
        metadata: { status: invoice.status, deliveryStatus: invoice.deliveryStatus, reference: safeReference },
      });
      MonitoringService.record({
        type: "PAYMENT_DUPLICATE_CALLBACK",
        section: "Payment Callback",
        description: `Duplicate callback ignored for ${invoice.status}/${invoice.deliveryStatus ?? "none"}`,
        userId: invoice.userId,
        severity: "warning",
        suggestedAction: "اگر تکرار زیاد است، retry درگاه را بررسی کنید.",
        metadata: { invoiceId: invoice.id, status: invoice.status, deliveryStatus: invoice.deliveryStatus },
      });
      return { statusCode: 200, text: ALREADY_PROCESSED_FA, result: await deps.existingCompletedResult(invoice.id) };
    }
    if (invoice.status === "FAILED" || invoice.status === "CANCELED" || invoice.status === "EXPIRED")
      return { statusCode: 409, text: "Payment invoice is not payable." };

    let paidInvoice = invoice;
    if (invoice.status === "PENDING") {
      const markedPaid = await prisma.$transaction(async (tx) => {
        const locked = await tx.paymentInvoice.updateMany({
          where: { id: invoice.id, status: "PENDING" },
          data: { status: "PAID", paidAt: new Date(), verifiedAt: new Date(), deliveryStatus: "PENDING" },
        });
        if (locked.count !== 1) return null;
        const fresh = await tx.paymentInvoice.findUniqueOrThrow({ where: { id: invoice.id } });
        await audit(tx, {
          userId: fresh.userId,
          invoiceId: fresh.id,
          action: "PAYMENT_INVOICE_MARKED_PAID",
          metadata: { payId: fresh.payId, amount: fresh.amount, type: fresh.type },
        });
        return fresh;
      });
      if (!markedPaid) return { statusCode: 200, text: ALREADY_PROCESSED_FA, result: await deps.existingCompletedResult(invoice.id) };
      paidInvoice = markedPaid;
      paymentLog("PAYMENT_INVOICE_MARKED_PAID", {
        invoiceId: paidInvoice.id,
        userId: paidInvoice.userId,
        payId: paidInvoice.payId,
        amount: paidInvoice.amount,
        type: paidInvoice.type,
      });
      paymentLog("PAYMENT_MARKED_PAID", {
        invoiceId: paidInvoice.id,
        userId: paidInvoice.userId,
        payId: paidInvoice.payId,
        amount: paidInvoice.amount,
        type: paidInvoice.type,
      });
    }

    const staleProcessingBefore = new Date(Date.now() - 5 * 60_000);
    const fulfillmentLock = await prisma.paymentInvoice.updateMany({
      where: {
        id: paidInvoice.id,
        status: "PAID",
        OR: [
          { deliveryStatus: null },
          { deliveryStatus: { in: ["PENDING", "FAILED", "FAILED_DELIVERY"] } },
          { deliveryStatus: "PROCESSING", updatedAt: { lt: staleProcessingBefore } },
        ],
      },
      data: { deliveryStatus: "PROCESSING" },
    });
    if (fulfillmentLock.count !== 1)
      return { statusCode: 200, text: ALREADY_PROCESSED_FA, result: await deps.existingCompletedResult(paidInvoice.id) };

    try {
      paymentLog("PAYMENT_FULFILLMENT_STARTED", { invoiceId: paidInvoice.id, userId: paidInvoice.userId, type: paidInvoice.type });
      await audit(prisma, {
        userId: paidInvoice.userId,
        invoiceId: paidInvoice.id,
        action: "PAYMENT_FULFILLMENT_STARTED",
        metadata: { type: paidInvoice.type },
      });
      let result =
        paidInvoice.type === PaymentInvoiceType.PRODUCT_PURCHASE
          ? await deps.finalizePaidProductPurchase({
              userId: paidInvoice.userId,
              productId: paidInvoice.productId ?? "",
              invoiceId: paidInvoice.id,
              paymentSource: "GATEWAY",
            })
          : await deps.fulfillPaidInvoice(paidInvoice.id);
      if ((result as any).needsXrayProvisioning && (result as any).order?.id)
        result = (await deps.provisionXrayClient((result as any).order.id, paidInvoice.id)) as any;
      const notificationResult =
        paidInvoice.type === PaymentInvoiceType.WALLET_TOPUP
          ? deps.walletTopupNotificationPayload((result as any).invoice ?? paidInvoice, (result as any).user)
          : paidInvoice.type === PaymentInvoiceType.PRODUCT_PURCHASE
            ? await deps.productCallbackResult((result as any).invoice ?? paidInvoice, result)
            : result;
      paymentLog("PAYMENT_COMPLETED", { invoiceId: paidInvoice.id, userId: paidInvoice.userId, type: paidInvoice.type });
      AdminService.invalidateDashboardCache();
      return { statusCode: 200, text: "Payment completed successfully.", result: notificationResult };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      paymentLog("PAYMENT_PROCESS_FAILED", { invoiceId: paidInvoice.id, userId: paidInvoice.userId, stage: "fulfillment", error: message });
      paymentLog("PAYMENT_FAILED", { invoiceId: paidInvoice.id, userId: paidInvoice.userId, stage: "fulfillment", error: message });
      await prisma.paymentInvoice.update({ where: { id: paidInvoice.id }, data: { deliveryStatus: "FAILED_DELIVERY", verifiedAt: new Date() } });
      MonitoringService.record({
        type: "PAYMENT_DELIVERY_FAILED",
        section: "Payment Delivery",
        description: message,
        userId: paidInvoice.userId,
        severity: "critical",
        suggestedAction: "تحویل محصول/شارژ کیف پول را از پنل مدیریت بررسی و دستی اصلاح کنید.",
        metadata: { invoiceId: paidInvoice.id, type: paidInvoice.type },
      });
      eventBus.emit("payment.delivery.failed", { invoiceId: paidInvoice.id, userId: paidInvoice.userId, type: paidInvoice.type, error: message });
      await audit(prisma, {
        userId: paidInvoice.userId,
        invoiceId: paidInvoice.id,
        action: "PAYMENT_PROCESS_FAILED",
        metadata: { stage: "fulfillment", error: message, statusKept: "PAID" },
      });
      return {
        statusCode: 500,
        text: "Payment processing failed.",
        failed: { invoice: paidInvoice, type: paidInvoice.type as PaymentInvoiceTypeModel, error: message },
      };
    }
  }
}
