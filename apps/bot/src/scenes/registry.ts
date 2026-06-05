import { Scenes } from 'telegraf';
import { z } from 'zod';

import { randomUUID } from 'node:crypto';

import { apiClient } from '../services/api-client.js';
import { createWizard, validateWizardInput } from './wizard-factory.js';

import type { BotContext } from '../sessions/session.js';

const supportDraftWizard = createWizard({
  id: 'support:draft',
  steps: [
    async (ctx) => {
      await ctx.reply('موضوع پیام پشتیبانی را کوتاه بنویسید. برای خروج /cancel را بفرستید.');
      ctx.wizard.next();
    },
    async (ctx) => {
      const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
      const subject = validateWizardInput(ctx, z.string().min(3).max(80), text);
      if (!subject) {
        await ctx.reply('موضوع باید بین ۳ تا ۸۰ کاراکتر باشد.');
        return;
      }
      ctx.session.flows.supportDraft = { name: 'supportDraft', step: 'body', data: { subject }, expiresAt: Date.now() + 10 * 60_000, retries: 0 };
      await ctx.reply('متن پیام را بنویسید. ثبت نهایی در فازهای بعدی فعال می‌شود.');
      ctx.wizard.next();
    },
    async (ctx) => {
      const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
      const body = validateWizardInput(ctx, z.string().min(10).max(1000), text);
      if (!body) {
        await ctx.reply('متن پیام باید حداقل ۱۰ کاراکتر باشد.');
        return;
      }
      const draft = ctx.session.flows.supportDraft?.data as { subject?: string } | undefined;
      const subject = draft?.subject ?? 'پشتیبانی';
      if (!ctx.session.user?.id) {
        await ctx.reply('ابتدا از منو وارد شوید.');
        await ctx.scene.leave();
        return;
      }
      try {
        const ticket = await apiClient.createTicket(
          {
            userId: ctx.session.user.id,
            subject,
            body,
            category: 'GENERAL',
            idempotencyKey: randomUUID(),
          },
          ctx.session.correlationId,
        );
        await ctx.reply(`✅ تیکت شما ثبت شد.\nشناسه: ${ticket.id.slice(0, 8)}…`);
      } catch {
        await ctx.reply('ثبت تیکت ناموفق بود. کمی بعد دوباره تلاش کنید.');
      }
      await ctx.scene.leave();
    },
  ],
});

export const createStage = (): Scenes.Stage<BotContext> => new Scenes.Stage<BotContext>([supportDraftWizard]);
