import { z } from 'zod';

export const uuidSchema = z.string().uuid();
export const telegramIdSchema = z.string().regex(/^\d{3,32}$/u);
export const moneyTomanSchema = z.number().int().min(0).max(10_000_000_000);
export const trafficGbSchema = z.number().int().min(1).max(10_000);
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
