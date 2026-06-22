import type { PaymentInvoice } from "@prisma/client";
import { prisma } from "../../services/prisma";
import { logger } from "../../services/logger";
import { MonitoringService } from "../../services/monitoring.service";
import { availableInventoryWhere, unassignedInventoryWhere } from "../product/visibility";
import { CouponService, normalizeCouponCode } from "../coupon/coupon.service";
import { XrayClientService, sanitizePanelError } from "../xray/xray.service";
import { XrayDiagnosticsService } from "../xray/xray-diagnostics.service";
import { audit, type DbClient } from "./payment-repository";
import { paymentLog } from "./payment-logging";
import type { ProductDeliveryResult, PurchaseMethod, TxClient } from "./payment.types";
import { PaymentDiscountService } from "./payment-discount.service";

type DeliveryDeps = {
  assertUserCanPay: (userId: string, tx?: DbClient) => Promise<unknown>;
  validateProductForPurchase: (userId: string, productId?: string, expectedAmount?: number, tx?: DbClient) => Promise<any>;
  debitWallet: (
    tx: TxClient,
    data: { userId: string; amount: number; reason: string; actorId: string; invoiceId?: string; referenceId?: string },
  ) => Promise<any>;
};

function xrayClientEmail(input: { telegramId: string; productId: string; orderId: string }) {
  return `tg${input.telegramId}-p${input.productId.slice(-8)}-o${input.orderId.slice(-8)}`
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 64);
}

export class PaymentDeliveryService {
  static async purchaseProduct(deps: DeliveryDeps,
    tx: TxClient,
    data: {
      userId: string;
      productId: string;
      couponCode?: string | null;
      method: PurchaseMethod;
      invoice?: Pick<
        PaymentInvoice,
        "id" | "amount" | "originalAmount" | "discountAmount" | "couponId" | "couponCode" | "productId" | "userId" | "status"
      >;
    },
  ): Promise<ProductDeliveryResult> {
    if (!data.productId) throw new Error("محصول فاکتور مشخص نیست");
    await deps.assertUserCanPay(data.userId, tx);
    const product = await deps.validateProductForPurchase(data.userId, data.productId, undefined, tx);

    let discountAmount = 0;
    let couponId: string | null = null;
    let couponMaxUses = 0;
    const originalAmount = product.price;
    let totalAmount = originalAmount;

    if (data.invoice) {
      if (data.invoice.userId !== data.userId || data.invoice.productId !== data.productId) throw new Error("فاکتور با خرید همخوانی ندارد");
      if (data.invoice.originalAmount !== originalAmount) throw new Error("مبلغ اصلی فاکتور با محصول همخوانی ندارد");
      if (data.invoice.status !== "PAID") throw new Error("پرداخت تایید نشده است");
      couponId = data.invoice.couponId ?? null;
      discountAmount = data.invoice.discountAmount;
      totalAmount = data.invoice.amount;
      if (originalAmount - discountAmount !== totalAmount) throw new Error("مبلغ فاکتور با مبلغ خرید همخوانی ندارد");
    } else if (data.couponCode) {
      const validation = await CouponService.validateForCheckout({ code: data.couponCode, userId: data.userId, originalAmount, productId: data.productId, tx });
      if (!validation.ok) {
        paymentLog("COUPON_RECHECK_FAILED", {
          userId: data.userId,
          productId: data.productId,
          couponCode: normalizeCouponCode(data.couponCode),
          reason: validation.reason,
          severity: "warning",
        });
        await audit(tx, {
          userId: data.userId,
          invoiceId: undefined,
          action: "COUPON_RECHECK_FAILED",
          metadata: { productId: data.productId, couponCode: normalizeCouponCode(data.couponCode), reason: validation.reason, severity: "warning" },
        });
        throw new Error(validation.reason);
      }
      couponId = validation.coupon.id;
      couponMaxUses = validation.coupon.maxUses;
      discountAmount = validation.discountAmount;
      totalAmount = validation.finalAmount;
    }

    const isXray =
      product.mode === "xray_auto" && Boolean(product.trafficBytes && product.durationDays && product.stockLimit && product.inboundIds.length);
    if (data.method === "WALLET" && totalAmount > 0) {
      const walletUser = await tx.user.findUniqueOrThrow({ where: { id: data.userId }, select: { balance: true } });
      if (walletUser.balance < totalAmount) throw new Error("موجودی کیف پول کافی نیست");
    }

    let account: Awaited<ReturnType<typeof tx.productAccount.findFirst>> | null = null;
    const reservedAt = new Date();
    if (isXray) {
      paymentLog("XRAY_REPEAT_PURCHASE_STARTED", {
        userId: data.userId,
        productId: product.id,
        invoiceId: data.invoice?.id,
        method: data.method,
      });
      await audit(tx, {
        userId: data.userId,
        invoiceId: data.invoice?.id,
        action: "XRAY_NEW_CLIENT_REQUIRED",
        metadata: { productId: product.id, reason: "new_purchase_scope", method: data.method },
      });
      if (!product.trafficBytes || !product.durationDays || !product.stockLimit || !product.inboundIds.length)
        throw new Error("تنظیمات محصول Xray کامل نیست");
      await audit(tx, {
        userId: data.userId,
        invoiceId: data.invoice?.id,
        action: "XRAY_DELIVERY_PENDING",
        metadata: { productId: product.id, method: data.method },
      });
    } else {
      const candidates = await tx.productAccount.findMany({
        where: { AND: [availableInventoryWhere(product.id), unassignedInventoryWhere()] },
        orderBy: { createdAt: "asc" },
        take: 10,
      });
      for (const candidate of candidates) {
        const reserved = await tx.productAccount.updateMany({
          where: { id: candidate.id, productId: product.id, status: "available", soldTo: null, soldAt: null, assignedTo: null, assignedAt: null },
          data: { status: "reserved", reservedBy: data.userId, reservedAt, reservationExpiresAt: new Date(reservedAt.getTime() + 15 * 60_000) },
        });
        if (reserved.count === 1) {
          account = candidate;
          break;
        }
      }
      if (!account) throw new Error("موجودی این محصول تمام شده است");
      await tx.productAccountHistory.create({
        data: {
          accountId: account.id,
          actorId: data.userId,
          action: "Inventory Reserved",
          fromValue: "available",
          toValue: "reserved",
          metadata: JSON.stringify({ invoiceId: data.invoice?.id, productId: product.id, reservedAt, method: data.method }),
        },
      });
      await audit(tx, {
        userId: data.userId,
        invoiceId: data.invoice?.id,
        action: "Inventory Reserved",
        metadata: { accountId: account.id, productId: product.id, method: data.method },
      });
    }

    const order = await tx.order.create({
      data: {
        userId: data.userId,
        productId: product.id,
        couponId,
        originalAmount,
        totalAmount,
        finalPaidAmount: totalAmount,
        discountAmount,
        status: "pending",
      },
    });
    const purchaseDate = new Date();
    const durationDays = isXray ? (product.durationDays ?? product.duration) : (account!.durationDays ?? product.duration);
    const expiresAt = new Date(purchaseDate.getTime() + durationDays * 86_400_000);
    let xrayClient: Awaited<ReturnType<typeof tx.xrayClient.create>> | null = null;
    let orderItem;
    if (isXray) {
      const user = await tx.user.findUniqueOrThrow({ where: { id: data.userId }, select: { telegramId: true } });
      const email = xrayClientEmail({ telegramId: user.telegramId, productId: product.id, orderId: order.id });
      xrayClient = await tx.xrayClient.create({
        data: {
          userId: data.userId,
          telegramId: user.telegramId,
          productId: product.id,
          orderId: order.id,
          clientEmail: email,
          inboundIds: product.inboundIds,
          limitIp: product.xrayLimitIp ?? 0,
          groupName: product.xrayGroupName,
          expiresAt,
          trafficBytes: product.trafficBytes!,
          status: "provisioning",
        },
      });
      paymentLog("XRAY_NEW_CLIENT_CREATED", {
        userId: data.userId,
        productId: product.id,
        orderId: order.id,
        invoiceId: data.invoice?.id,
        xrayClientId: xrayClient.id,
        clientEmail: xrayClient.clientEmail,
      });
      await audit(tx, {
        userId: data.userId,
        invoiceId: data.invoice?.id,
        action: "XRAY_NEW_CLIENT_CREATED",
        metadata: { productId: product.id, orderId: order.id, xrayClientId: xrayClient.id, clientEmail: xrayClient.clientEmail },
      });
      orderItem = null;
    } else {
      orderItem = await tx.orderItem.create({
        data: {
          orderId: order.id,
          productId: product.id,
          productAccountId: account!.id,
          deliveredUsername: account!.username,
          deliveredPassword: account!.password,
          deliveredSubscriptionLink: account!.subscriptionLink,
          deliveredConfigLink: account!.configLink,
          deliveredConfig: account!.configLink || account!.config,
          purchaseDate,
          expiresAt,
          isActive: true,
        },
      });
    }

    if (!isXray) {
      const soldAt = new Date();
      const sold = await tx.productAccount.updateMany({
        where: { id: account!.id, productId: product.id, status: "reserved", reservedBy: data.userId, AND: [unassignedInventoryWhere()] },
        data: {
          status: "sold",
          soldTo: data.userId,
          soldAt,
          assignedTo: data.userId,
          assignedAt: soldAt,
          expiresAt,
          reservedBy: null,
          reservedAt: null,
        },
      });
      if (sold.count !== 1) throw new Error("تحویل اکانت ناموفق بود");
      if (!orderItem) throw new Error("آیتم سفارش تحویلی نامعتبر است");
      if (!orderItem.productAccountId) throw new Error("شناسه اکانت تحویلی نامعتبر است");
      if (data.method === "WALLET" && totalAmount > 0) {
        await deps.debitWallet(tx, {
          userId: data.userId,
          amount: totalAmount,
          reason: `خرید محصول ${product.title}`,
          actorId: data.userId,
          referenceId: `purchase:${order.id}`,
        });
      }
      await tx.order.update({ where: { id: order.id }, data: { status: "completed" } });
      if (couponId)
        await PaymentDiscountService.confirmCouponUsage(tx, {
          couponId,
          userId: data.userId,
          orderId: order.id,
          invoiceId: data.invoice?.id,
          productId: product.id,
          originalAmount,
          discountAmount,
          finalAmount: totalAmount,
        });
      await tx.productAccountHistory.create({
        data: {
          accountId: account!.id,
          actorId: data.userId,
          action: "Inventory Sold",
          fromValue: "reserved",
          toValue: "sold",
          metadata: JSON.stringify({
            invoiceId: data.invoice?.id,
            orderId: order.id,
            orderItemId: orderItem.id,
            productId: product.id,
            soldAt,
            expiresAt,
            method: data.method,
          }),
        },
      });
      await audit(tx, {
        userId: data.userId,
        invoiceId: data.invoice?.id,
        action: "Inventory Sold",
        metadata: { accountId: account!.id, orderId: order.id },
      });
    }
    await audit(tx, {
      userId: data.userId,
      invoiceId: data.invoice?.id,
      action: isXray ? "XRAY_PRODUCT_DELIVERED" : "PRODUCT_DELIVERED",
      metadata: {
        productId: product.id,
        orderId: order.id,
        accountId: account?.id,
        xrayClientId: xrayClient?.id,
        method: data.method,
        originalAmount,
        discountAmount,
        finalAmount: totalAmount,
      },
    });
    const deliveredAccount = account
      ? await tx.productAccount.findUniqueOrThrow({ where: { id: account.id } })
      : { id: xrayClient!.id, username: xrayClient!.clientEmail, subscriptionLink: null, configLink: null, config: "XRAY_LIVE_LINKS" };
    return {
      ok: true,
      order,
      product,
      account: deliveredAccount,
      orderItem,
      xrayClient,
      totalAmount,
      originalAmount,
      discountAmount,
      couponId,
      couponCode: data.couponCode,
      expiresAt,
    };
  }

  static async provisionXrayClient(deps: DeliveryDeps, orderId: string, invoiceId?: string) {
    const client = await prisma.xrayClient.findFirstOrThrow({ where: { orderId }, include: { order: true, product: true } });
    paymentLog("XRAY_IDEMPOTENCY_REUSE_CHECK", { orderId, invoiceId, xrayClientId: client.id, existingOrderId: client.orderId, status: client.status });
    if (client.orderId !== orderId) {
      logger.error("XRAY_IDEMPOTENCY_REUSE_REJECTED_DIFFERENT_ORDER", { orderId, invoiceId, xrayClientId: client.id, existingOrderId: client.orderId });
      throw new Error("Xray idempotency scope mismatch: existing client belongs to another order");
    }
    if (client.status === "active") {
      paymentLog("XRAY_IDEMPOTENCY_REUSE_ALLOWED_SAME_ORDER", { orderId, invoiceId, xrayClientId: client.id });
      const orderItem = await prisma.orderItem.findFirst({ where: { xrayClientId: client.id, orderId } });
      const product = client.product ?? (await prisma.product.findUniqueOrThrow({ where: { id: client.productId ?? "" } }));
      return {
        ok: true,
        order: client.order!,
        product,
        account: { id: client.id, username: client.clientEmail, subscriptionLink: null, configLink: null, config: "XRAY_LIVE_LINKS" },
        orderItem,
        xrayClient: client,
        totalAmount: client.order?.totalAmount ?? 0,
        originalAmount: client.order?.originalAmount ?? 0,
        discountAmount: client.order?.discountAmount ?? 0,
        couponId: client.order?.couponId ?? null,
        couponCode: undefined,
        expiresAt: client.expiresAt,
      };
    }
    if (client.status !== "provisioning" && client.status !== "creating") throw new Error("تحویل Xray قبلاً ناموفق شده و نیازمند بررسی مدیر است");
    const product = client.product ?? (await prisma.product.findUniqueOrThrow({ where: { id: client.productId ?? "" } }));
    let panelClientCreated = false;
    try {
      const claimed = await prisma.xrayClient.updateMany({ where: { id: client.id, status: "provisioning" }, data: { status: "creating" } });
      if (claimed.count !== 1 && client.status !== "creating") throw new Error("درخواست خرید قبلی شما برای این محصول هنوز در حال پردازش است");
      await prisma.order.update({ where: { id: orderId }, data: { status: "panel_creating" } });
      const created = await XrayClientService.createClient({
        email: client.clientEmail,
        trafficBytes: client.trafficBytes,
        expiresAt: client.expiresAt,
        telegramId: client.telegramId,
        inboundIds: client.inboundIds,
        limitIp: client.limitIp,
        groupName: client.groupName,
      });
      panelClientCreated = true;
      await XrayClientService.verifyPanelClient({
        email: client.clientEmail,
        expectedInboundIds: client.inboundIds,
        requireLinks: true,
      });
      const verified = await XrayDiagnosticsService.verifyXrayClient(client.id);
      if (!verified.ok) throw new Error(`XRAY_VERIFICATION_FAILED:${verified.reason}`);
      await prisma.order.update({ where: { id: orderId }, data: { status: "panel_verified" } });
      const result = await prisma.$transaction(async (tx) => {
        const freshOrder = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
        const sold = await tx.product.updateMany({
          where: { id: product.id, mode: "xray_auto", soldCount: { lt: product.stockLimit ?? 0 } },
          data: { soldCount: { increment: 1 } },
        });
        if (sold.count !== 1) throw new Error("موجودی این محصول تمام شده است");
        if (!invoiceId && freshOrder.totalAmount > 0)
          await deps.debitWallet(tx, {
            userId: client.userId,
            amount: freshOrder.totalAmount,
            reason: `خرید محصول ${product.title}`,
            actorId: client.userId,
            referenceId: `purchase:${orderId}`,
          });
        let item = await tx.orderItem.findFirst({ where: { xrayClientId: client.id, orderId } });
        if (!item)
          item = await tx.orderItem.create({
            data: {
              orderId,
              productId: product.id,
              xrayClientId: client.id,
              deliveredUsername: client.clientEmail,
              deliveredSubscriptionLink: null,
              deliveredConfigLink: null,
              deliveredConfig: "XRAY_LIVE_LINKS",
              purchaseDate: new Date(),
              expiresAt: client.expiresAt,
              isActive: true,
            },
          });
        if (freshOrder.couponId)
          await PaymentDiscountService.confirmCouponUsage(tx, {
            couponId: freshOrder.couponId,
            userId: client.userId,
            orderId,
            invoiceId,
            productId: product.id,
            originalAmount: freshOrder.originalAmount,
            discountAmount: freshOrder.discountAmount,
            finalAmount: freshOrder.finalPaidAmount,
          });
        const updatedClient = await tx.xrayClient.update({
          where: { id: client.id },
          data: {
            status: "active",
            clientSubId: verified.clientSubId ?? created.subId,
            panelClientId: verified.panelClientId ?? created.uuid ?? created.id,
            lastError: null,
          },
        });
        await tx.order.update({ where: { id: orderId }, data: { status: "delivered" } });
        const completedOrder = await tx.order.update({ where: { id: orderId }, data: { status: "completed" } });
        if (invoiceId)
          await tx.paymentInvoice.update({
            where: { id: invoiceId },
            data: { deliveryStatus: "COMPLETED", status: "COMPLETED", completedAt: new Date(), verifiedAt: new Date(), orderId },
          });
        await audit(tx, {
          userId: client.userId,
          invoiceId,
          action: "XRAY_PRODUCT_DELIVERED",
          metadata: {
            orderId,
            xrayClientId: client.id,
            deliveryId: orderId,
            panelClientId: verified.panelClientId,
            step: "delivered",
            status: "success",
          },
        });
        return { order: completedOrder, orderItem: item, xrayClient: updatedClient };
      });
      return {
        ok: true,
        order: result.order,
        product,
        account: {
          id: result.xrayClient.id,
          username: result.xrayClient.clientEmail,
          subscriptionLink: null,
          configLink: null,
          config: "XRAY_LIVE_LINKS",
        },
        orderItem: result.orderItem,
        xrayClient: result.xrayClient,
        totalAmount: result.order.totalAmount,
        originalAmount: result.order.originalAmount,
        discountAmount: result.order.discountAmount,
        couponId: result.order.couponId,
        couponCode: undefined,
        expiresAt: result.xrayClient.expiresAt,
      };
    } catch (error) {
      const message = sanitizePanelError(error);
      logger.error("XRAY_CLIENT_CREATE_FAILED", {
        orderId,
        deliveryId: orderId,
        userId: client.userId,
        productId: client.productId,
        xrayClientId: client.id,
        step: "panel_verified",
        status: "failed",
        error: message,
      });
      let cleanupStatus: "failed" | "orphaned_panel_client" = "failed";
      if (panelClientCreated) {
        try {
          await XrayClientService.deleteClient(client.clientEmail);
          await prisma.auditLog.create({
            data: {
              actorId: client.userId,
              action: "xray_delivery.panel_client_deleted",
              metadata: JSON.stringify({ orderId, xrayClientId: client.id, email: client.clientEmail, reason: message }),
            },
          });
        } catch (cleanupError) {
          cleanupStatus = "orphaned_panel_client";
          await prisma.auditLog.create({
            data: {
              actorId: client.userId,
              action: "xray_delivery.orphaned_panel_client",
              metadata: JSON.stringify({
                orderId,
                deliveryId: orderId,
                xrayClientId: client.id,
                email: client.clientEmail,
                error: message,
                cleanupError: sanitizePanelError(cleanupError),
              }),
            },
          });
        }
      }
      await prisma.xrayClient.update({ where: { id: client.id }, data: { status: cleanupStatus, lastError: message } });
      await prisma.order.update({ where: { id: orderId }, data: { status: "failed_delivery" } });
      if (invoiceId)
        await prisma.paymentInvoice.update({
          where: { id: invoiceId },
          data: { deliveryStatus: "FAILED_DELIVERY", verifiedAt: new Date(), orderId },
        });
      await prisma.auditLog.create({
        data: {
          actorId: client.userId,
          action: "xray_delivery.failed",
          metadata: JSON.stringify({ orderId, deliveryId: orderId, xrayClientId: client.id, error: message, panelClientCreated, cleanupStatus }),
        },
      });
      MonitoringService.record({
        type: "XRAY_CLIENT_CREATE_FAILED",
        section: "Xray Delivery",
        description: message,
        userId: client.userId,
        severity: "critical",
        suggestedAction: "تحویل سرویس Xray را بررسی و دستی retry کنید. کیف پول تا قبل از verify کسر نمی‌شود و کلاینت پنل حذف/علامت‌گذاری می‌شود.",
        metadata: { orderId, xrayClientId: client.id, panelClientCreated, cleanupStatus },
      });
      throw new Error(
        "ساخت اکانت با مشکل مواجه شد. مبلغی از کیف پول شما کسر نشده / سهمیه تست شما مصرف نشده است. لطفاً دوباره تلاش کنید یا با پشتیبانی تماس بگیرید.",
      );
    }
  }


}
