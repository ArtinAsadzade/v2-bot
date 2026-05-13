import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_ENV: z.enum(['development', 'staging', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  API_HOST: z.string().default('0.0.0.0'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  API_CORS_ORIGINS: z.string().default('http://localhost:3000'),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  QUEUE_PREFIX: z.string().min(1).default('v2bot'),
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_WEBHOOK_DOMAIN: z.string().optional().default(''),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),
  PASSWORD_PEPPER: z.string().min(32),
  XRAY_API_BASE_URL: z.string().url(),
  XRAY_API_TOKEN: z.string().min(1),
  XRAY_API_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  CRYPTO_PAYMENTS_PROVIDER: z.string().min(1),
  CRYPTO_PAYMENTS_API_KEY: z.string().min(1),
  CRYPTO_PAYMENTS_WEBHOOK_SECRET: z.string().min(32),
});

export type Env = z.infer<typeof envSchema>;

export const loadEnv = (source: NodeJS.ProcessEnv = process.env): Env => envSchema.parse(source);
