import { botConfig } from '../config/env.js';

import type { BotContext } from '../sessions/session.js';
import type { MiddlewareFn } from 'telegraf';

export const adminDetectionMiddleware = (): MiddlewareFn<BotContext> => async (ctx, next) => {
  ctx.session.isAdmin = ctx.from ? botConfig.BOT_ADMIN_IDS.has(String(ctx.from.id)) : false;
  await next();
};
