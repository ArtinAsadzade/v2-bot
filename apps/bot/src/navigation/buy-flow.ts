import { randomUUID } from 'node:crypto';

import { apiClient } from '../services/api-client.js';
import {
  buyQuoteTemplate,
  productPickerTemplate,
  purchaseSuccessTemplate,
} from '../templates/service-messages.js';
import { confirmationDialog, loadingMessage } from '../ui/components.js';
import { keyboard } from '../keyboards/inline-keyboard.js';

import type { BotContext } from '../sessions/session.js';
import type { InlineKeyboardMarkup } from 'telegraf/types';

const flowKey = 'buy';

export const ensureBuyFlow = (ctx: BotContext): void => {
  if (!ctx.session.flows[flowKey]) {
    ctx.session.flows[flowKey] = {
      name: flowKey,
      step: 'product',
      data: {},
      expiresAt: Date.now() + 900_000,
      retries: 0,
    };
  }
};

export const renderBuyScreen = async (ctx: BotContext): Promise<{ text: string; reply_markup: InlineKeyboardMarkup }> => {
  ensureBuyFlow(ctx);
  const flow = ctx.session.flows[flowKey]!;
  const userId = ctx.session.user?.id;
  if (!userId) {
    return { text: 'لطفاً ابتدا /start را بزنید.', reply_markup: keyboard().row(keyboard().button('منو', 'nav', 'menu')).build() };
  }

  if (flow.step === 'product') {
    const products = await apiClient.listProducts(ctx.session.correlationId);
    flow.data.products = products;
    const kb = keyboard();
    for (const p of products.slice(0, 8)) {
      kb.row(keyboard().button(p.name, 'buy', 'product', p.id));
    }
    kb.row(keyboard().button('بازگشت', 'nav', 'menu'));
    return {
      text: productPickerTemplate(products),
      reply_markup: kb.build(),
    };
  }

  if (flow.step === 'traffic') {
    const kb = keyboard();
    for (const gb of [10, 20, 50, 100]) {
      kb.row(keyboard().button(`${gb} GB`, 'buy', 'traffic', String(gb)));
    }
    kb.row(keyboard().button('بازگشت', 'nav', 'buy'));
    return {
      text: '📊 حجم ترافیک را انتخاب کنید:',
      reply_markup: kb.build(),
    };
  }

  if (flow.step === 'confirm') {
    const product = flow.data.selectedProduct as { id: string; name: string };
    const trafficGb = Number(flow.data.trafficGb);
    const quote = await apiClient.calculatePricing({ trafficGb }, ctx.session.correlationId);
    flow.data.quote = quote;
    return confirmationDialog(
      buyQuoteTemplate({
        trafficGb,
        finalAmountToman: quote.finalAmountToman,
        productName: product.name,
      }),
      'confirm',
      'buy',
    );
  }

  return { text: loadingMessage(), reply_markup: keyboard().row(keyboard().button('منو', 'nav', 'menu')).build() };
};

export const handleBuyAction = async (ctx: BotContext, action: string, value?: string): Promise<void> => {
  ensureBuyFlow(ctx);
  const flow = ctx.session.flows[flowKey]!;
  const userId = ctx.session.user?.id;
  if (!userId) return;

  if (action === 'product' && value) {
    const products = (flow.data.products as Array<{ id: string; name: string }>) ?? [];
    const product = products.find((p) => p.id === value);
    if (!product) return;
    flow.data.selectedProduct = product;
    flow.step = 'traffic';
    const rendered = await renderBuyScreen(ctx);
    await ctx.replyOrEdit(rendered.text, { reply_markup: rendered.reply_markup });
    return;
  }

  if (action === 'traffic' && value) {
    flow.data.trafficGb = Number(value);
    flow.step = 'confirm';
    const rendered = await renderBuyScreen(ctx);
    await ctx.replyOrEdit(rendered.text, { reply_markup: rendered.reply_markup });
    return;
  }

  if (action === 'confirm') {
    const product = flow.data.selectedProduct as { id: string };
    const trafficGb = Number(flow.data.trafficGb);
    const idempotencyKey = `buy:${userId}:${randomUUID()}`;
    await ctx.replyOrEdit(loadingMessage('در حال پردازش خرید و ساخت سرویس...'));
    const draft = await apiClient.createPurchaseDraft(
      {
        userId,
        productId: product.id,
        trafficGb,
        reserveFunds: true,
        idempotencyKey: `draft:${idempotencyKey}`,
      },
      ctx.session.correlationId,
    );
    const result = await apiClient.finalizePurchase(
      {
        userId,
        draftId: draft.id,
        idempotencyKey,
        telegramId: ctx.from?.id?.toString(),
      },
      ctx.session.correlationId,
    );
    delete ctx.session.flows[flowKey];
    const kb = keyboard();
    if (result.subscription?.subscriptionUrl) {
      kb.row(keyboard().url('🔗 لینک اشتراک', result.subscription.subscriptionUrl));
    }
    for (const link of result.subscription?.configLinks.slice(0, 3) ?? []) {
      kb.row(keyboard().url(`${link.protocol}`, link.url));
    }
    kb.row(keyboard().button('سرویس‌های من', 'nav', 'services'));
    kb.row(keyboard().button('منوی اصلی', 'nav', 'menu'));
    await ctx.replyOrEdit(purchaseSuccessTemplate(result), { reply_markup: kb.build() });
  }
};
