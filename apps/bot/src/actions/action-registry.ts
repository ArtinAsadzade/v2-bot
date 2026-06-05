import { parseCallbackData } from '../callbacks/callback-data.js';
import { handleBuyAction } from '../navigation/buy-flow.js';
import { navigation } from '../navigation/navigation-manager.js';
import { handleServiceAction } from '../navigation/services-flow.js';
import { errorState } from '../ui/components.js';

import type { BotContext } from '../sessions/session.js';
import type { Telegraf } from 'telegraf';

type ActionHandler = (ctx: BotContext, value?: string) => Promise<void> | void;

type ActionKey = `${string}:${string}`;

export class ActionRegistry {
  private readonly handlers = new Map<ActionKey, ActionHandler>();

  public register(namespace: string, action: string, handler: ActionHandler): this {
    this.handlers.set(`${namespace}:${action}`, handler);
    return this;
  }

  public attach(bot: Telegraf<BotContext>): void {
    bot.on('callback_query', async (ctx) => {
      const data = 'data' in ctx.callbackQuery ? ctx.callbackQuery.data : undefined;
      const parsed = data ? parseCallbackData(data) : null;
      if (!parsed) {
        await ctx.answerCbQuery(ctx.t('error.invalidAction'), { show_alert: true });
        return;
      }
      const handler = this.handlers.get(`${parsed.namespace}:${parsed.action}`) ?? this.handlers.get(`${parsed.namespace}:*`);
      if (!handler) {
        await ctx.answerCbQuery(ctx.t('error.invalidAction'), { show_alert: true });
        await navigation.go(ctx, 'menu', undefined, false);
        return;
      }
      await ctx.answerCbQuery();
      await handler(ctx, parsed.value);
    });
  }
}

export const actionRegistry = new ActionRegistry()
  .register('nav', 'menu', async (ctx) => navigation.go(ctx, 'menu'))
  .register('nav', 'back', async (ctx, fallback) => navigation.back(ctx, fallback ?? 'menu'))
  .register('nav', '*', async (ctx) => {
    const data = 'data' in ctx.callbackQuery! ? ctx.callbackQuery.data : '';
    const parsed = parseCallbackData(data);
    await navigation.go(ctx, parsed?.action ?? 'menu', parsed?.value ? { page: parsed.value } : undefined);
  })
  .register('buy', '*', async (ctx, value) => {
    const data = 'data' in ctx.callbackQuery! ? ctx.callbackQuery.data : '';
    const parsed = parseCallbackData(data);
    await handleBuyAction(ctx, parsed?.action ?? 'noop', value ?? parsed?.value);
  })
  .register('confirm', 'confirm', async (ctx) => handleBuyAction(ctx, 'confirm'))
  .register('service', '*', async (ctx, value) => {
    const data = 'data' in ctx.callbackQuery! ? ctx.callbackQuery.data : '';
    const parsed = parseCallbackData(data);
    await handleServiceAction(ctx, parsed?.action ?? 'view', value ?? parsed?.value);
  })
  .register('noop', '*', async (ctx) => ctx.replyOrEdit(errorState(ctx.t('placeholder.body'))));

export const registerActions = (bot: Telegraf<BotContext>): void => actionRegistry.attach(bot);
