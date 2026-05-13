import { Scenes } from 'telegraf';

import type { BotContext } from '../sessions/session.js';
import type { z } from 'zod';

type WizardStep = (ctx: BotContext) => Promise<void> | void;

export type WizardOptions = {
  id: string;
  ttlMs?: number;
  maxRetries?: number;
  steps: WizardStep[];
};

export const validateWizardInput = <T>(ctx: BotContext, schema: z.ZodSchema<T>, value: unknown): T | null => {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const retries = (ctx.scene.session.retries ?? 0) + 1;
  ctx.scene.session.retries = retries;
  return null;
};

export const createWizard = ({ id, ttlMs = 10 * 60_000, maxRetries = 3, steps }: WizardOptions): Scenes.WizardScene<BotContext> => {
  const scene = new Scenes.WizardScene<BotContext>(id, ...steps);
  scene.enter((ctx, next) => {
    ctx.scene.session.expiresAt = Date.now() + ttlMs;
    ctx.scene.session.retries = 0;
    return next();
  });
  scene.use(async (ctx, next) => {
    if (ctx.message && 'text' in ctx.message && ctx.message.text === '/cancel') {
      await ctx.reply(ctx.t('common.cancel'));
      await ctx.scene.leave();
      return;
    }
    if (ctx.scene.session.expiresAt && ctx.scene.session.expiresAt < Date.now()) {
      await ctx.reply('زمان این گفتگو تمام شد. لطفاً دوباره شروع کنید.');
      await ctx.scene.leave();
      return;
    }
    if ((ctx.scene.session.retries ?? 0) > maxRetries) {
      await ctx.reply('تعداد تلاش‌ها بیش از حد مجاز بود.');
      await ctx.scene.leave();
      return;
    }
    await next();
  });
  return scene;
};
