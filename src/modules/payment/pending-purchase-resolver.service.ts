import type { PaymentInvoice, Order, Product } from "@prisma/client";
import { prisma } from "../../services/prisma";
import { audit } from "./payment-repository";
import { PaymentService } from "./payment.service";

function envSeconds(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const invoiceTtlSeconds = () => envSeconds("INVOICE_PENDING_TTL_SECONDS", 30 * 60);
const processingTtlSeconds = () => envSeconds("PURCHASE_PENDING_TTL_SECONDS", 15 * 60);

export type PendingPurchaseState =
  | "active_processing"
  | "unpaid_invoice"
  | "paid_delivery_pending"
  | "failed_delivery"
  | "stale_unpaid"
  | "stale_processing"
  | "no_blocking_purchase";

export type PendingPurchaseResolution = {
  state: PendingPurchaseState;
  invoice?: PaymentInvoice | null;
  order?: (Order & { product?: Product | null }) | null;
  product?: Product | null;
  canContinuePayment: boolean;
  canCancel: boolean;
  canRetryDelivery: boolean;
  canStartNew: boolean;
  needsSupport: boolean;
};

export class PendingPurchaseResolverService {
  static async resolve(userId: string, productId: string): Promise<PendingPurchaseResolution> {
    const now = Date.now();
    const invoiceCutoff = new Date(now - invoiceTtlSeconds() * 1000);
    const processingCutoff = new Date(now - processingTtlSeconds() * 1000);
    const product = await prisma.product.findUnique({ where: { id: productId } });

    const invoice = await prisma.paymentInvoice.findFirst({
      where: { userId, productId, type: "PRODUCT_PURCHASE", status: { in: ["PENDING", "PAID"] } },
      orderBy: { createdAt: "desc" },
    });

    if (invoice) {
      const deliveryStatus = invoice.deliveryStatus ?? "PENDING";
      if (invoice.status === "PENDING") {
        if (invoice.createdAt < invoiceCutoff) return { state: "stale_unpaid", invoice, product, canContinuePayment: false, canCancel: true, canRetryDelivery: false, canStartNew: true, needsSupport: false };
        if (invoice.paymentLink) return { state: "unpaid_invoice", invoice, product, canContinuePayment: true, canCancel: true, canRetryDelivery: false, canStartNew: false, needsSupport: false };
        return { state: "active_processing", invoice, product, canContinuePayment: false, canCancel: true, canRetryDelivery: false, canStartNew: false, needsSupport: true };
      }
      if (["FAILED_DELIVERY", "FAILED"].includes(deliveryStatus)) return { state: "failed_delivery", invoice, product, canContinuePayment: false, canCancel: false, canRetryDelivery: true, canStartNew: false, needsSupport: true };
      if (["PENDING", "PROCESSING"].includes(deliveryStatus)) {
        const stale = invoice.updatedAt < processingCutoff;
        return { state: stale ? "stale_processing" : "paid_delivery_pending", invoice, product, canContinuePayment: false, canCancel: false, canRetryDelivery: stale || deliveryStatus === "PENDING", canStartNew: false, needsSupport: true };
      }
      return { state: "active_processing", invoice, product, canContinuePayment: false, canCancel: false, canRetryDelivery: false, canStartNew: false, needsSupport: true };
    }

    const order = await prisma.order.findFirst({
      where: { userId, productId, status: { in: ["pending", "reserving", "panel_creating", "panel_verified", "failed_delivery"] } },
      include: { product: true },
      orderBy: { createdAt: "desc" },
    });
    if (!order) return { state: "no_blocking_purchase", product, canContinuePayment: false, canCancel: false, canRetryDelivery: false, canStartNew: true, needsSupport: false };
    const stale = order.createdAt < processingCutoff;
    if (order.status === "failed_delivery") return { state: "failed_delivery", order, product: order.product, canContinuePayment: false, canCancel: false, canRetryDelivery: true, canStartNew: false, needsSupport: true };
    return { state: stale ? "stale_processing" : "active_processing", order, product: order.product, canContinuePayment: false, canCancel: order.status === "pending" || order.status === "reserving", canRetryDelivery: stale, canStartNew: false, needsSupport: true };
  }

  static async cancelUnpaid(userId: string, productId: string) {
    return prisma.$transaction(async (tx) => {
      const invoice = await tx.paymentInvoice.findFirst({ where: { userId, productId, type: "PRODUCT_PURCHASE", status: "PENDING" }, orderBy: { createdAt: "desc" } });
      if (invoice) {
        await tx.paymentInvoice.updateMany({ where: { id: invoice.id, status: "PENDING" }, data: { status: "CANCELED", deliveryStatus: "CANCELED" } });
        await audit(tx, { userId, invoiceId: invoice.id, action: "PURCHASE_PENDING_CANCELED_BY_USER", metadata: { productId } });
      }
      const order = await tx.order.findFirst({ where: { userId, productId, status: { in: ["pending", "reserving"] } }, orderBy: { createdAt: "desc" } });
      if (order) {
        await tx.order.updateMany({ where: { id: order.id, status: { in: ["pending", "reserving"] } }, data: { status: "cancelled" } });
        await tx.auditLog.create({ data: { actorId: userId, action: "purchase.pending_order_cancelled", metadata: JSON.stringify({ orderId: order.id, productId }) } });
      }
      return { invoice, order };
    });
  }

  static async retryDelivery(userId: string, productId: string) {
    const invoice = await prisma.paymentInvoice.findFirst({ where: { userId, productId, type: "PRODUCT_PURCHASE", status: "PAID", deliveryStatus: { in: ["PENDING", "FAILED", "FAILED_DELIVERY"] } }, orderBy: { updatedAt: "asc" } });
    if (invoice) {
      await audit(prisma, { userId, invoiceId: invoice.id, action: "PURCHASE_PENDING_DELIVERY_RETRY_REQUESTED", metadata: { productId } });
      return PaymentService.completePayment(invoice.id, { source: "user_pending_purchase_retry" });
    }
    return null;
  }
}
