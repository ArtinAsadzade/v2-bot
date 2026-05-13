import { createCryptoPaymentsConfig } from './crypto-payments.js';
import { createDatabaseConfig } from './database.js';
import { loadEnv } from './env.js';
import { createJwtConfig } from './jwt.js';
import { createRedisConfig } from './redis.js';
import { createTelegramConfig } from './telegram.js';
import { createXrayConfig } from './xray.js';

const env = loadEnv();
const corsOrigins = env.API_CORS_ORIGINS.split(',').map((origin) => origin.trim());

export const config = {
  app: { env: env.APP_ENV, nodeEnv: env.NODE_ENV, isDev: env.APP_ENV === 'development' },
  api: { host: env.API_HOST, port: env.API_PORT, corsOrigins },
  logger: { level: env.LOG_LEVEL },
  database: createDatabaseConfig(env),
  redis: createRedisConfig(env),
  queue: { prefix: env.QUEUE_PREFIX },
  telegram: createTelegramConfig(env),
  jwt: createJwtConfig(env),
  security: { passwordPepper: env.PASSWORD_PEPPER },
  xray: createXrayConfig(env),
  cryptoPayments: createCryptoPaymentsConfig(env),
} as const;

export type AppConfig = typeof config;
