import type { PaymentInvoice } from "@prisma/client";
import { prisma } from "../../services/prisma";
import { XrayClientService } from "../xray/xray.service";
import type { InvoiceNotificationPayload } from "./payment.types";

export class PaymentNotificationService {
  static notificationInvoice(invoice: Pick<PaymentInvoice, "id" | "userId" | "amount">) {
    return { id: invoice.id, userId: invoice.userId, amount: invoice.amount };
  }

  static async productNotificationPayload(
    invoice: Pick<PaymentInvoice, "id" | "userId" | "amount">,
    delivery: any,
  ): Promise<InvoiceNotificationPayload> {
    const xrayClient = delivery.xrayClient ?? delivery.orderItem?.xrayClient;
    const xraySubscriptionLink = xrayClient ? await XrayClientService.subscriptionUrl(xrayClient).catch(() => null) : null;
    const account = xrayClient
      ? {
          id: xrayClient.id,
          username: xrayClient.clientEmail,
          subscriptionLink: xraySubscriptionLink,
          configLink: null,
          config: delivery.orderItem?.deliveredConfig ?? null,
        }
      : delivery.account;
    return {
      invoice: PaymentNotificationService.notificationInvoice(invoice),
      type: "PRODUCT_PURCHASE",
      product: delivery.product,
      account: {
        id: account.id,
        username: account.username,
        subscriptionLink: account.subscriptionLink,
        configLink: account.configLink,
        config: account.config,
      },
      order: delivery.order,
      orderItem: delivery.orderItem,
      xrayClient: xrayClient
        ? {
            id: xrayClient.id,
            clientEmail: xrayClient.clientEmail,
            expiresAt: xrayClient.expiresAt,
          }
        : undefined,
    };
  }

  static async productCallbackResult(invoice: Pick<PaymentInvoice, "id" | "userId" | "amount">, purchaseResult: any) {
    const notification = (await PaymentNotificationService.productNotificationPayload(invoice, purchaseResult)) as any;
    return {
      invoice: notification.invoice,
      type: "PRODUCT_PURCHASE" as const,
      product: notification.product,
      account: notification.account,
      order: purchaseResult.order,
      orderItem: purchaseResult.orderItem,
      xrayClient: notification.xrayClient,
      purchaseResult,
    };
  }

  static walletTopupNotificationPayload(
    invoice: Pick<PaymentInvoice, "id" | "userId" | "amount">,
    user: { balance: number },
  ): InvoiceNotificationPayload {
    return {
      invoice: PaymentNotificationService.notificationInvoice(invoice),
      type: "WALLET_TOPUP",
      user: { balance: user.balance },
    };
  }

  static async existingCompletedResult(invoiceId: string): Promise<any | null> {
    const invoice = await prisma.paymentInvoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) return null;
    if (invoice.type === "WALLET_TOPUP" && invoice.status === "COMPLETED") {
      const user = await prisma.user.findUniqueOrThrow({ where: { id: invoice.userId }, select: { balance: true } });
      return PaymentNotificationService.walletTopupNotificationPayload(invoice, user);
    }
    if (invoice.type === "XRAY_RENEWAL" && invoice.status === "COMPLETED") {
      const renewal = invoice.renewalId
        ? await prisma.xrayRenewal.findUnique({ where: { id: invoice.renewalId }, include: { xrayClient: true } })
        : null;
      return {
        invoice: PaymentNotificationService.notificationInvoice(invoice),
        type: "XRAY_RENEWAL",
        renewal: renewal ?? undefined,
        xrayClient: renewal?.xrayClient
          ? { id: renewal.xrayClient.id, clientEmail: renewal.xrayClient.clientEmail, expiresAt: renewal.xrayClient.expiresAt }
          : undefined,
      };
    }
    if (invoice.type === "PRODUCT_PURCHASE" && invoice.status === "COMPLETED" && invoice.orderId) {
      const order = await prisma.order.findUnique({
        where: { id: invoice.orderId },
        include: { product: true, items: { include: { productAccount: true, xrayClient: true }, take: 1 } },
      });
      const item = order?.items[0];
      if (!order || !item) return { invoice: PaymentNotificationService.notificationInvoice(invoice), type: "PRODUCT_PURCHASE" };
      const account = item.xrayClient
        ? {
            id: item.xrayClient.id,
            username: item.xrayClient.clientEmail,
            subscriptionLink: await XrayClientService.subscriptionUrl(item.xrayClient).catch(() => null),
            configLink: null,
            config: item.deliveredConfig,
          }
        : item.productAccount
          ? {
              id: item.productAccount.id,
              username: item.productAccount.username,
              subscriptionLink: item.productAccount.subscriptionLink,
              configLink: item.productAccount.configLink,
              config: item.productAccount.config,
            }
          : {
              id: item.id,
              username: item.deliveredUsername,
              subscriptionLink: item.deliveredSubscriptionLink,
              configLink: item.deliveredConfigLink,
              config: item.deliveredConfig,
            };
      return PaymentNotificationService.productCallbackResult(invoice, { invoice, order, product: order.product, account, orderItem: item, xrayClient: item.xrayClient });
    }
    return null;
  }

}
