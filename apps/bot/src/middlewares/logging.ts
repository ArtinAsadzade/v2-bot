import { logger } from '../core/logger.js';

import type { BotContext } from '../sessions/session.js';
import type { MiddlewareFn } from 'telegraf';

export const loggingMiddleware = (): MiddlewareFn<BotContext> => async (ctx, next) => {
  const startedAt = Date.now();
  await next();
  logger.info({ updateId: ctx.update.update_id, userId: ctx.from?.id, chatId: ctx.chat?.id, durationMs: Date.now() - startedAt }, 'telegram update handled');
};
