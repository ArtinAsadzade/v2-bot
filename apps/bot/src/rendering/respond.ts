import type { BotContext } from '../sessions/session.js';
import type { MiddlewareFn } from 'telegraf';

export const responseMiddleware = (): MiddlewareFn<BotContext> => async (ctx, next) => {
  ctx.replyOrEdit = async (text, extra = {}) => {
    const options = { ...extra };
    if (ctx.callbackQuery?.message && 'message_id' in ctx.callbackQuery.message) {
      try {
        return await ctx.editMessageText(text, options as never);
      } catch (error) {
        if (String(error).includes('message is not modified')) return undefined;
      }
    }
    return ctx.reply(text, options as never);
  };
  await next();
};
