import { botConfig } from '../config/env.js';

import type { BotContext } from '../sessions/session.js';
import type { MiddlewareFn } from 'telegraf';

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export const rateLimitMiddleware = (): MiddlewareFn<BotContext> => async (ctx, next) => {
  const key = String(ctx.from?.id ?? ctx.chat?.id ?? ctx.update.update_id);
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + botConfig.RATE_LIMIT_WINDOW_SECONDS * 1000 });
    return next();
  }
  bucket.count += 1;
  if (bucket.count > botConfig.RATE_LIMIT_MAX_UPDATES) {
    if (ctx.callbackQuery) await ctx.answerCbQuery(ctx.t('rateLimited'));
    else await ctx.reply(ctx.t('rateLimited'));
    return;
  }
  await next();
};
