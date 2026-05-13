import { z } from 'zod';

const botEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_BOT_USERNAME: z.string().min(1).default('v2bot'),
  REDIS_URL: z.string().url(),
  API_BASE_URL: z.string().url().default('http://localhost:3000/v1'),
  BOT_ADMIN_IDS: z
    .string()
    .default('')
    .transform((value) => new Set(value.split(',').map((id) => id.trim()).filter(Boolean))),
  SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(60 * 60 * 24 * 14),
  RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(3),
  RATE_LIMIT_MAX_UPDATES: z.coerce.number().int().positive().default(8),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

export const botConfig = botEnvSchema.parse(process.env);
