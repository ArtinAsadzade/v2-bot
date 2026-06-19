import { PaymentInvoiceType } from "@prisma/client";
import { prisma } from "../../services/prisma";
import { audit } from "./payment-repository";
import { paymentLog } from "./payment-logging";
import { assertProductDeliverySuccess, type ProductDeliveryResult, type PurchaseMethod, type TxClient } from "./payment.types";
import { PaymentDeliveryService } from "./payment-delivery.service";

type FulfillmentDeps = {
  creditWallet: (
    tx: TxClient,
    data: { userId: string; amount: number; reason: string; actorId: string; invoiceId?: string; referenceId?: string },
  ) => Promise<any>;
  fulfillXrayRenewal: (invoiceId: string) => Promise<any>;
  deliveryDeps: Parameters<typeof PaymentDeliveryService.purchaseProduct>[0];
};

export class PaymentFulfillmentService {
  static async fulfillPaidInvoice(deps: FulfillmentDeps, invoiceId: string) {
    return prisma.$transaction(async (tx) => {
      const fresh = await tx.paymentInvoice.findUniqueOrThrow({ where: { id: invoiceId } });
      if (fresh.status === "COMPLETED") return { invoice: fresh, type: fresh.type as PaymentInvoiceType };
      if (fresh.status !== "PAID") throw new Error("فاکتور در وضعیت پرداخت‌شده نیست");
      if (fresh.deliveryStatus !== "PROCESSING") throw new Error("فاکتور در حال پردازش تحویل نیست");

      if (fresh.type === "XRAY_RENEWAL") {
        const result = await deps.fulfillXrayRenewal(fresh.id);
        return { ...result, type: fresh.type as PaymentInvoiceType };
      }

      if (fresh.type === "WALLET_TOPUP") {
        const user = await deps.creditWallet(tx, {
          userId: fresh.userId,
          amount: fresh.amount,
          reason: `شارژ کیف پول با پرداخت آنی - فاکتور ${fresh.id}`,
          actorId: fresh.userId,
          invoiceId: fresh.id,
          referenceId: `invoice:${fresh.id}`,
        });
        const completed = await tx.paymentInvoice.update({
          where: { id: fresh.id },
          data: { status: "COMPLETED", completedAt: new Date(), verifiedAt: new Date(), deliveryStatus: "COMPLETED" },
        });
        paymentLog("PAYMENT_WALLET_CREDITED", { invoiceId: fresh.id, userId: fresh.userId, amount: fresh.amount, balance: user.balance });
        await audit(tx, {
          userId: fresh.userId,
          invoiceId: fresh.id,
          action: "PAYMENT_WALLET_CREDITED",
          metadata: { amount: fresh.amount, balance: user.balance },
        });
        await audit(tx, {
          userId: fresh.userId,
          invoiceId: fresh.id,
          action: "PAYMENT_INVOICE_COMPLETED",
          metadata: { amount: fresh.amount, type: fresh.type },
        });
        return { invoice: completed, user, type: fresh.type as PaymentInvoiceType };
      }

      if (fresh.orderId) {
        const existingOrder = await tx.order.findUnique({
          where: { id: fresh.orderId },
          include: { product: true, items: { include: { productAccount: true, xrayClient: true }, take: 1 }, xrayClients: { take: 1 } },
        });
        if (existingOrder && !existingOrder.items[0] && existingOrder.xrayClients[0]) {
          const existingClient = existingOrder.xrayClients[0];
          if (existingClient.status === "active") {
            const item = await tx.orderItem.findFirst({ where: { xrayClientId: existingClient.id } });
            if (item) {
              const completed = await tx.paymentInvoice.update({
                where: { id: fresh.id },
                data: {
                  status: "COMPLETED",
                  completedAt: fresh.completedAt ?? new Date(),
                  verifiedAt: new Date(),
                  deliveryStatus: "COMPLETED",
                  orderId: existingOrder.id,
                },
              });
              return {
                invoice: completed,
                order: existingOrder,
                product: existingOrder.product,
                account: {
                  id: existingClient.id,
                  username: existingClient.clientEmail,
                  subscriptionLink: null,
                  configLink: null,
                  config: item.deliveredConfig,
                },
                orderItem: item,
                xrayClient: existingClient,
                type: fresh.type as PaymentInvoiceType,
              };
            }
          }
          if (existingClient.status === "failed") throw new Error("تحویل Xray قبلاً ناموفق شده و نیازمند بررسی مدیر است");
          return {
            invoice: fresh,
            order: existingOrder,
            product: existingOrder.product,
            account: {
              id: existingClient.id,
              username: existingClient.clientEmail,
              subscriptionLink: null,
              configLink: null,
              config: "XRAY_LIVE_LINKS",
            },
            orderItem: null,
            xrayClient: existingClient,
            needsXrayProvisioning: existingClient.status === "provisioning" || existingClient.status === "creating",
            type: fresh.type as PaymentInvoiceType,
          };
        }
        if (existingOrder?.items[0]) {
          const existingClient = existingOrder.items[0].xrayClient;
          if (existingClient && existingClient.status !== "active") {
            if (existingClient.status === "failed") throw new Error("تحویل Xray قبلاً ناموفق شده و نیازمند بررسی مدیر است");
            return {
              invoice: fresh,
              order: existingOrder,
              product: existingOrder.product,
              account: {
                id: existingClient.id,
                username: existingClient.clientEmail,
                subscriptionLink: null,
                configLink: null,
                config: "XRAY_LIVE_LINKS",
              },
              orderItem: existingOrder.items[0],
              xrayClient: existingClient,
              needsXrayProvisioning: existingClient.status === "provisioning" || existingClient.status === "creating",
              type: fresh.type as PaymentInvoiceType,
            };
          }
          const completed = await tx.paymentInvoice.update({
            where: { id: fresh.id },
            data: { status: "COMPLETED", completedAt: fresh.completedAt ?? new Date(), verifiedAt: new Date(), deliveryStatus: "COMPLETED" },
          });
          const account = existingClient
            ? {
                id: existingClient.id,
                username: existingClient.clientEmail,
                subscriptionLink: null,
                configLink: null,
                config: existingOrder.items[0].deliveredConfig,
              }
            : existingOrder.items[0].productAccount;
          return {
            invoice: completed,
            order: existingOrder,
            product: existingOrder.product,
            account,
            orderItem: existingOrder.items[0],
            xrayClient: existingClient ?? undefined,
            type: fresh.type as PaymentInvoiceType,
          };
        }
      }

      const deliveredResult = await PaymentDeliveryService.purchaseProduct(deps.deliveryDeps, tx, {
        userId: fresh.userId,
        productId: fresh.productId ?? "",
        couponCode: fresh.couponCode ?? undefined,
        method: "GATEWAY",
        invoice: fresh,
      });
      const delivered = assertProductDeliverySuccess(deliveredResult);
      if (delivered.xrayClient) {
        const processing = await tx.paymentInvoice.update({
          where: { id: fresh.id },
          data: { verifiedAt: new Date(), orderId: delivered.order.id, deliveryStatus: "PROCESSING" },
        });
        return { invoice: processing, ...delivered, needsXrayProvisioning: true, type: fresh.type as PaymentInvoiceType };
      }
      const completed = await tx.paymentInvoice.update({
        where: { id: fresh.id },
        data: { status: "COMPLETED", completedAt: new Date(), verifiedAt: new Date(), orderId: delivered.order.id, deliveryStatus: "COMPLETED" },
      });
      paymentLog("PAYMENT_PRODUCT_DELIVERED", {
        invoiceId: fresh.id,
        userId: fresh.userId,
        orderId: delivered.order.id,
        productId: delivered.product.id,
        accountId: delivered.account.id,
      });
      await audit(tx, {
        userId: fresh.userId,
        invoiceId: fresh.id,
        action: "PAYMENT_PRODUCT_DELIVERED",
        metadata: { orderId: delivered.order.id, productId: delivered.product.id, accountId: delivered.account.id },
      });
      await audit(tx, {
        userId: fresh.userId,
        invoiceId: fresh.id,
        action: "PAYMENT_INVOICE_COMPLETED",
        metadata: { orderId: delivered.order.id, amount: fresh.amount, type: fresh.type },
      });
      return { invoice: completed, ...delivered, needsXrayProvisioning: Boolean(delivered.xrayClient), type: fresh.type as PaymentInvoiceType };
    });
  }


  static async finalizePaidProductPurchase(
    deps: FulfillmentDeps,
    data: { userId: string; productId: string; invoiceId?: string; paymentSource: PurchaseMethod; couponCode?: string | null },
  ): Promise<any> {
    if (data.invoiceId) {
      const invoice = await prisma.paymentInvoice.findUniqueOrThrow({ where: { id: data.invoiceId } });
      if (invoice.type !== "PRODUCT_PURCHASE") throw new Error("فاکتور محصول نیست");
      if (invoice.userId !== data.userId || invoice.productId !== data.productId) throw new Error("فاکتور با خرید همخوانی ندارد");
      const result = await PaymentFulfillmentService.fulfillPaidInvoice(deps, invoice.id);
      if ((result as any).needsXrayProvisioning && (result as any).order?.id)
        return PaymentDeliveryService.provisionXrayClient(deps.deliveryDeps, (result as any).order.id, invoice.id);
      return result;
    }

    const result = await prisma.$transaction((tx) =>
      PaymentDeliveryService.purchaseProduct(deps.deliveryDeps, tx, {
        userId: data.userId,
        productId: data.productId,
        couponCode: data.couponCode,
        method: data.paymentSource,
      }),
    );
    const delivered = assertProductDeliverySuccess(result);
    if (delivered.xrayClient) return PaymentDeliveryService.provisionXrayClient(deps.deliveryDeps, delivered.order.id);
    return delivered;
  }
}
