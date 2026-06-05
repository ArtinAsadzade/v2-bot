import { backHomeKeyboard, mainMenuKeyboard } from '../keyboards/main-menu.keyboard.js';
import { walletCardTemplate } from '../templates/financial-messages.js';
import {
  notificationsTemplate,
  referralDashboardTemplate,
  supportHubTemplate,
  ticketListTemplate,
} from '../templates/engagement-messages.js';
import { mainMenuTemplate, profileTemplate } from '../templates/messages.js';
import { apiClient } from '../services/api-client.js';
import { renderBuyScreen } from './buy-flow.js';
import { renderServicesScreen } from './services-flow.js';
import { emptyState, errorState } from '../ui/components.js';

import type { BotContext, NavigationEntry } from '../sessions/session.js';
import type { InlineKeyboardMarkup } from 'telegraf/types';

type ScreenResult = { text: string; reply_markup: InlineKeyboardMarkup };
type ScreenHandler = (
  ctx: BotContext,
  params?: Record<string, string>,
) => ScreenResult | Promise<ScreenResult>;

export class NavigationManager {
  private readonly screens = new Map<string, ScreenHandler>();

  public register(screen: string, handler: ScreenHandler): this {
    this.screens.set(screen, handler);
    return this;
  }

  public async go(ctx: BotContext, screen: string, params?: Record<string, string>, push = true): Promise<void> {
    const current: NavigationEntry = {
      screen,
      enteredAt: Date.now(),
      ...(params !== undefined ? { params } : {}),
      ...(ctx.callbackQuery?.message && 'message_id' in ctx.callbackQuery.message
        ? { messageId: ctx.callbackQuery.message.message_id }
        : {}),
    };
    if (push && ctx.session.navigation.current) ctx.session.navigation.stack.push(ctx.session.navigation.current);
    ctx.session.navigation.current = current;
    const rendered = await this.render(ctx, screen, params);
    await ctx.replyOrEdit(rendered.text, { reply_markup: rendered.reply_markup });
  }

  public async back(ctx: BotContext, fallback = 'menu'): Promise<void> {
    const previous = ctx.session.navigation.stack.pop();
    if (!previous) return this.go(ctx, fallback, undefined, false);
    ctx.session.navigation.current = previous;
    const rendered = await this.render(ctx, previous.screen, previous.params);
    await ctx.replyOrEdit(rendered.text, { reply_markup: rendered.reply_markup });
  }

  public async render(
    ctx: BotContext,
    screen: string,
    params?: Record<string, string>,
  ): Promise<ScreenResult> {
    const handler = this.screens.get(screen) ?? this.screens.get('menu');
    if (!handler) throw new Error(`Navigation screen is not registered: ${screen}`);
    return handler(ctx, params);
  }
}

export const navigation = new NavigationManager()
  .register('menu', (ctx) => ({ text: mainMenuTemplate(ctx), reply_markup: mainMenuKeyboard(ctx) }))
  .register('profile', (ctx) => ({ text: profileTemplate(ctx), reply_markup: backHomeKeyboard(ctx) }))
  .register('referral', async (ctx) => {
    if (!ctx.session.user?.id) {
      return { text: emptyState(ctx.t('menu.referral'), 'ابتدا وارد شوید.'), reply_markup: backHomeKeyboard(ctx) };
    }
    try {
      const stats = await apiClient.getReferralStats(ctx.session.user.id, ctx.session.correlationId);
      return {
        text: referralDashboardTemplate(ctx, stats),
        reply_markup: backHomeKeyboard(ctx),
      };
    } catch {
      return { text: errorState('خطا در بارگذاری دعوت'), reply_markup: backHomeKeyboard(ctx) };
    }
  })
  .register('settings', (ctx) => ({ text: `${ctx.t('settings.title')}\n\n${ctx.t('settings.body')}`, reply_markup: backHomeKeyboard(ctx) }))
  .register('services', (ctx) => renderServicesScreen(ctx))
  .register('buy', (ctx) => renderBuyScreen(ctx))
  .register('wallet', async (ctx) => {
    if (!ctx.session.user?.id) {
      return { text: emptyState(ctx.t('menu.wallet'), ctx.t('empty.wallet')), reply_markup: backHomeKeyboard(ctx) };
    }
    try {
      const wallet = await apiClient.getWallet(ctx.session.user.id, ctx.session.correlationId);
      return { text: walletCardTemplate(wallet), reply_markup: backHomeKeyboard(ctx) };
    } catch {
      return { text: errorState('خطا در دریافت کیف پول'), reply_markup: backHomeKeyboard(ctx) };
    }
  })
  .register('support', async (ctx) => {
    if (!ctx.session.user?.id) {
      return { text: emptyState(ctx.t('menu.support'), 'ابتدا وارد شوید.'), reply_markup: backHomeKeyboard(ctx) };
    }
    try {
      const tickets = await apiClient.listTickets(ctx.session.user.id, ctx.session.correlationId);
      const text = [supportHubTemplate(ctx), '', ticketListTemplate(tickets)].join('\n');
      return { text, reply_markup: backHomeKeyboard(ctx) };
    } catch {
      return { text: errorState('خطا در پشتیبانی'), reply_markup: backHomeKeyboard(ctx) };
    }
  })
  .register('notifications', async (ctx) => {
    if (!ctx.session.user?.id) {
      return { text: emptyState('اعلان‌ها', 'ابتدا وارد شوید.'), reply_markup: backHomeKeyboard(ctx) };
    }
    try {
      const items = await apiClient.listNotifications(ctx.session.user.id, ctx.session.correlationId);
      return {
        text: notificationsTemplate(items),
        reply_markup: backHomeKeyboard(ctx),
      };
    } catch {
      return { text: errorState('خطا در اعلان‌ها'), reply_markup: backHomeKeyboard(ctx) };
    }
  });
