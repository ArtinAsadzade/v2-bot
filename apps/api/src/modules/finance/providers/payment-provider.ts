import type { CurrencyCode, PaymentNetwork } from '@prisma/client';

export type CreateInvoiceInput = {
  invoiceId: string;
  amountToman: bigint;
  asset: CurrencyCode;
  network: PaymentNetwork;
  expiresAt: Date;
  idempotencyKey: string;
};

export type ProviderInvoice = {
  provider: string;
  providerInvoiceId: string;
  assetAmount?: string;
  payAddress: string;
  memo?: string;
  requiredConfirmations: number;
  metadata?: Record<string, unknown>;
};

export type PaymentVerification = {
  paid: boolean;
  confirmations: number;
  txHash?: string;
  providerPaymentId?: string;
  raw: Record<string, unknown>;
};

export type ParsedWebhook = {
  eventId: string;
  providerInvoiceId?: string | undefined;
  invoiceId?: string | undefined;
  txHash?: string | undefined;
  confirmations?: number | undefined;
  paid?: boolean | undefined;
};

export interface PaymentProvider {
  readonly name: string;
  createInvoice(input: CreateInvoiceInput): Promise<ProviderInvoice>;
  verifyPayment(providerInvoiceId: string): Promise<PaymentVerification>;
  verifyWebhookSignature(payload: string, signature: string, timestamp: string): boolean;
  parseWebhook(payload: unknown): ParsedWebhook;
}
