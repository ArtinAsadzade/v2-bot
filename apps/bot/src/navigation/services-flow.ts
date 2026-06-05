import { apiClient } from '../services/api-client.js';
import { serviceDetailTemplate, serviceListTemplate } from '../templates/service-messages.js';
import { keyboard } from '../keyboards/inline-keyboard.js';
import { emptyState } from '../ui/components.js';

import type { BotContext } from '../sessions/session.js';
import type { InlineKeyboardMarkup } from 'telegraf/types';

export const renderServicesScreen = async (
  ctx: BotContext,
): Promise<{ text: string; reply_markup: InlineKeyboardMarkup }> => {
  const userId = ctx.session.user?.id;
  if (!userId) {
    return {
      text: emptyState('سرویس‌ها', 'ابتدا وارد ربات شوید.'),
      reply_markup: keyboard().row(keyboard().button('منو', 'nav', 'menu')).build(),
    };
  }
  const services = await apiClient.listServices(userId, ctx.session.correlationId);
  const kb = keyboard();
  for (const s of services.slice(0, 8)) {
    kb.row(keyboard().button(s.productName, 'service', 'view', s.id));
  }
  kb.row(keyboard().button('خرید جدید', 'nav', 'buy'));
  kb.row(keyboard().button('بازگشت', 'nav', 'menu'));
  return { text: serviceListTemplate(services), reply_markup: kb.build() };
};

export const renderServiceDetail = async (
  ctx: BotContext,
  serviceId: string,
): Promise<{ text: string; reply_markup: InlineKeyboardMarkup }> => {
  const userId = ctx.session.user?.id!;
  const service = await apiClient.getService(userId, serviceId, ctx.session.correlationId);
  const xray = service.xrayClient as { subscriptionUrl?: string } | undefined;
  const kb = keyboard();
  if (xray?.subscriptionUrl) kb.row(keyboard().url('🔗 اشتراک', xray.subscriptionUrl));
  kb.row(keyboard().button('بروزرسانی لینک‌ها', 'service', 'regen', serviceId));
  kb.row(keyboard().button('بازگشت', 'nav', 'services'));
  return { text: serviceDetailTemplate(service), reply_markup: kb.build() };
};

export const handleServiceAction = async (
  ctx: BotContext,
  action: string,
  value?: string,
): Promise<void> => {
  const userId = ctx.session.user?.id;
  if (!userId || !value) return;
  if (action === 'view') {
    const rendered = await renderServiceDetail(ctx, value);
    await ctx.replyOrEdit(rendered.text, { reply_markup: rendered.reply_markup });
    return;
  }
  if (action === 'regen') {
    await apiClient.regenerateLinks(userId, value, ctx.session.correlationId);
    const rendered = await renderServiceDetail(ctx, value);
    await ctx.replyOrEdit('✅ لینک‌ها بروزرسانی شد.\n\n' + rendered.text, {
      reply_markup: rendered.reply_markup,
    });
  }
};
