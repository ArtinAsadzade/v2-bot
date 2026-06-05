import { z } from 'zod';

const amountString = z
  .string()
  .regex(/^\d+$/u)
  .refine((value) => BigInt(value) > 0n, 'Amount must be positive');
const uuid = z.string().uuid();

export const createDepositSchema = z.object({
  userId: uuid,
  amountToman: amountString,
  asset: z.enum(['USDT']).default('USDT'),
  network: z.enum(['TRON']).default('TRON'),
  idempotencyKey: z.string().min(12).max(160),
});

export const verifyPaymentSchema = z.object({
  invoiceId: uuid,
  idempotencyKey: z.string().min(12).max(160).optional(),
});

export const userIdParamsSchema = z.object({ userId: uuid });

export const listTransactionsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

export const pricingSchema = z.object({
  userId: uuid.optional(),
  trafficGb: z.coerce.number().int().min(1).max(10_000),
  couponCode: z.string().min(2).max(64).optional(),
  region: z.string().max(80).optional(),
  userSegment: z.string().max(80).optional(),
});

export const purchaseDraftSchema = pricingSchema.extend({
  userId: uuid,
  productId: uuid,
  reserveFunds: z.boolean().default(false),
  idempotencyKey: z.string().min(12).max(160),
});

export const adminWalletOperationSchema = z.object({
  adminId: uuid,
  userId: uuid,
  amountToman: amountString,
  reason: z.string().min(4).max(240),
  idempotencyKey: z.string().min(12).max(160),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const freezeWalletSchema = z.object({
  adminId: uuid,
  userId: uuid,
  amountToman: amountString,
  reason: z.string().min(4).max(240),
  idempotencyKey: z.string().min(12).max(160),
});

export const webhookHeadersSchema = z.object({
  'x-payment-signature': z.string().min(16),
  'x-payment-timestamp': z.string().regex(/^\d+$/u),
  'x-payment-event-id': z.string().min(8).max(180),
});
