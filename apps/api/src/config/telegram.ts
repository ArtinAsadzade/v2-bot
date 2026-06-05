import type { Env } from './env.js';

export const createTelegramConfig = (env: Env) => ({
  botToken: env.TELEGRAM_BOT_TOKEN,
  botUsername: env.TELEGRAM_BOT_USERNAME,
  webhookDomain: env.TELEGRAM_WEBHOOK_DOMAIN,
}) as const;
