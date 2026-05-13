import { z } from 'zod';

export const telegramUserSyncBodySchema = z.object({
  telegramId: z.string().regex(/^\d{3,32}$/u),
  username: z.string().min(1).max(64).optional(),
  firstName: z.string().min(1).max(128).optional(),
  lastName: z.string().min(1).max(128).optional(),
  languageCode: z.string().min(2).max(16).optional(),
  referralCode: z.string().min(4).max(32).regex(/^[A-Za-z0-9_-]+$/u).optional(),
});

export type TelegramUserSyncBody = z.infer<typeof telegramUserSyncBodySchema>;
