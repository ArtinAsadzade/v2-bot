import type { Prisma, PaymentInvoice } from "@prisma/client";

export type PaymentGatewayInput = {
  enabled?: boolean;
  apiBaseUrl?: string;
  apiKey?: string;
  callbackUrl?: string;
  gatewayName?: string;
  displayOrder?: number;
};

export type TxClient = Prisma.TransactionClient;
export type AuditData = { userId?: string | null; invoiceId?: string | null; action: string; metadata?: Record<string, unknown>; actorId?: string };
export type PurchaseMethod = "WALLET" | "GATEWAY";

export type DeliveredAccount = {
  id: string;
  username: string | null;
  subscriptionLink: string | null;
  configLink: string | null;
  config: string | null;
};

export type ProductDeliverySuccess = {
  ok: true;
  order: Prisma.OrderGetPayload<{}>;
  product: Prisma.ProductGetPayload<{}>;
  account: DeliveredAccount;
  orderItem: Prisma.OrderItemGetPayload<{}> | null;
  xrayClient?: Prisma.XrayClientGetPayload<{}> | null;
  totalAmount: number;
  originalAmount: number;
  discountAmount: number;
  couponId: string | null;
  couponCode?: string | null;
  expiresAt: Date;
  reused?: boolean;
};

export type ProductDeliveryFailure = {
  ok: false;
  error: string;
  reason: "processing" | "pending_payment" | "failed";
  recoverable: boolean;
  invoice?: PaymentInvoice;
  paymentLink?: string | null;
  orderId?: string | null;
  xrayClientId?: string | null;
};

export type ProductDeliveryResult = ProductDeliverySuccess | ProductDeliveryFailure;

export function assertProductDeliverySuccess(result: ProductDeliveryResult): ProductDeliverySuccess {
  if (!result.ok) throw new Error(result.error);
  return result;
}

export type ProductInvoiceQuote = {
  originalAmount: number;
  discountAmount: number;
  finalAmount: number;
  couponId: string | null;
  couponCode: string | null;
};

export type InvoiceNotificationPayload =
  | {
      invoice: Pick<PaymentInvoice, "id" | "userId" | "amount">;
      type: "WALLET_TOPUP";
      user: { balance: number };
    }
  | {
      invoice: Pick<PaymentInvoice, "id" | "userId" | "amount">;
      type: "PRODUCT_PURCHASE" | "XRAY_RENEWAL";
      product?: { id: string; title: string };
      account?: { id: string; username: string | null; subscriptionLink: string | null; configLink: string | null; config: string | null };
      order?: unknown;
      orderItem?: unknown;
      xrayClient?: { id: string; clientEmail: string; expiresAt?: Date };
      renewal?: unknown;
    };
