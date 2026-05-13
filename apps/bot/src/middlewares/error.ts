import { logger } from '../core/logger.js';

import type { BotContext } from '../sessions/session.js';
import type { Telegraf } from 'telegraf';

export const registerErrorHandler = (bot: Telegraf<BotContext>): void => {
  bot.catch(async (error, ctx) => {
    logger.error({ error, updateId: ctx.update.update_id, userId: ctx.from?.id }, 'telegram update failed');
    if (ctx.callbackQuery) await ctx.answerCbQuery(ctx.t?.('error.generic') ?? 'خطا', { show_alert: true }).catch(() => undefined);
    await ctx.reply(ctx.t?.('error.generic') ?? 'مشکلی پیش آمد.').catch(() => undefined);
  });
};
