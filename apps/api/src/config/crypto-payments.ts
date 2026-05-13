import type { Env } from './env.js';

export const createCryptoPaymentsConfig = (env: Env) => ({ provider: env.CRYPTO_PAYMENTS_PROVIDER, apiKey: env.CRYPTO_PAYMENTS_API_KEY, webhookSecret: env.CRYPTO_PAYMENTS_WEBHOOK_SECRET }) as const;
