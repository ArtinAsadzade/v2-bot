import type { Env } from './env.js';

export const createTelegramConfig = (env: Env) => ({ botToken: env.TELEGRAM_BOT_TOKEN, webhookDomain: env.TELEGRAM_WEBHOOK_DOMAIN }) as const;
