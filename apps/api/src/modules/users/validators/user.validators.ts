import { z } from 'zod';

export const findUserByTelegramParamsSchema = z.object({ telegramId: z.string().regex(/^\d{3,32}$/u) });
