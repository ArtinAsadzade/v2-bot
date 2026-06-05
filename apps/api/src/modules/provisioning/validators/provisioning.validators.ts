import { z } from 'zod';

const uuid = z.string().uuid();

export const finalizePurchaseSchema = z.object({
  userId: uuid,
  draftId: uuid,
  idempotencyKey: z.string().min(12).max(160),
  telegramId: z.string().optional(),
});

export const userIdParamsSchema = z.object({ userId: uuid });

export const serviceParamsSchema = z.object({ userId: uuid, serviceId: uuid });

export const renewServiceSchema = z.object({
  extraDays: z.coerce.number().int().min(1).max(365),
  extraTrafficGb: z.coerce.number().int().min(0).max(10_000).optional(),
});

export const createDraftWithProductSchema = z.object({
  userId: uuid,
  productId: uuid,
  trafficGb: z.coerce.number().int().min(1).max(10_000),
  couponCode: z.string().min(2).max(64).optional(),
  region: z.string().max(80).optional(),
  userSegment: z.string().max(80).optional(),
  reserveFunds: z.boolean().default(true),
  idempotencyKey: z.string().min(12).max(160),
});
