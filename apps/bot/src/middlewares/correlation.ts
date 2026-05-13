import { randomUUID } from 'node:crypto';

import type { BotContext } from '../sessions/session.js';
import type { MiddlewareFn } from 'telegraf';

export const correlationMiddleware = (): MiddlewareFn<BotContext> => async (ctx, next) => {
  ctx.session.correlationId = ctx.session.correlationId ?? randomUUID();
  await next();
};
