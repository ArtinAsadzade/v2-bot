import { z } from 'zod';

const botEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  REDIS_URL: z.string().url(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

export const botConfig = botEnvSchema.parse(process.env);
