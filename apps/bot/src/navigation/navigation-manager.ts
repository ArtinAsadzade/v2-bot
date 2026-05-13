import { botConfig } from '../config/env.js';
import { backHomeKeyboard, mainMenuKeyboard } from '../keyboards/main-menu.keyboard.js';
import { mainMenuTemplate, placeholderTemplate, profileTemplate, referralTemplate } from '../templates/messages.js';
import { emptyState } from '../ui/components.js';

import type { BotContext, NavigationEntry } from '../sessions/session.js';
import type { InlineKeyboardMarkup } from 'telegraf/types';

type ScreenResult = { text: string; reply_markup: InlineKeyboardMarkup };
type ScreenHandler = (ctx: BotContext, params?: Record<string, string>) => ScreenResult;

const inviteLink = (ctx: BotContext): string => `https://t.me/${botConfig.TELEGRAM_BOT_USERNAME}?start=${ctx.session.user?.referralCode ?? ''}`;

export class NavigationManager {
  private readonly screens = new Map<string, ScreenHandler>();

  public register(screen: string, handler: ScreenHandler): this {
    this.screens.set(screen, handler);
    return this;
  }

  public async go(ctx: BotContext, screen: string, params?: Record<string, string>, push = true): Promise<void> {
    const current: NavigationEntry = { screen, params, enteredAt: Date.now(), messageId: ctx.callbackQuery?.message && 'message_id' in ctx.callbackQuery.message ? ctx.callbackQuery.message.message_id : undefined };
    if (push && ctx.session.navigation.current) ctx.session.navigation.stack.push(ctx.session.navigation.current);
    ctx.session.navigation.current = current;
    const rendered = this.render(ctx, screen, params);
    await ctx.replyOrEdit(rendered.text, { reply_markup: rendered.reply_markup });
  }

  public async back(ctx: BotContext, fallback = 'menu'): Promise<void> {
    const previous = ctx.session.navigation.stack.pop();
    if (!previous) return this.go(ctx, fallback, undefined, false);
    ctx.session.navigation.current = previous;
    const rendered = this.render(ctx, previous.screen, previous.params);
    await ctx.replyOrEdit(rendered.text, { reply_markup: rendered.reply_markup });
  }

  public render(ctx: BotContext, screen: string, params?: Record<string, string>): ScreenResult {
    const handler = this.screens.get(screen) ?? this.screens.get('menu');
    if (!handler) throw new Error(`Navigation screen is not registered: ${screen}`);
    return handler(ctx, params);
  }
}

export const navigation = new NavigationManager()
  .register('menu', (ctx) => ({ text: mainMenuTemplate(ctx), reply_markup: mainMenuKeyboard(ctx) }))
  .register('profile', (ctx) => ({ text: profileTemplate(ctx), reply_markup: backHomeKeyboard(ctx) }))
  .register('referral', (ctx) => ({ text: referralTemplate(ctx, inviteLink(ctx)), reply_markup: backHomeKeyboard(ctx) }))
  .register('settings', (ctx) => ({ text: `${ctx.t('settings.title')}\n\n${ctx.t('settings.body')}`, reply_markup: backHomeKeyboard(ctx) }))
  .register('services', (ctx) => ({ text: emptyState(ctx.t('menu.services'), ctx.t('empty.services')), reply_markup: backHomeKeyboard(ctx) }))
  .register('buy', (ctx) => ({ text: placeholderTemplate(ctx, ctx.t('menu.buy')), reply_markup: backHomeKeyboard(ctx) }))
  .register('wallet', (ctx) => ({ text: placeholderTemplate(ctx, ctx.t('menu.wallet')), reply_markup: backHomeKeyboard(ctx) }))
  .register('support', (ctx) => ({ text: placeholderTemplate(ctx, ctx.t('menu.support')), reply_markup: backHomeKeyboard(ctx) }));
