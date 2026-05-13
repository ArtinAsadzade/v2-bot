import { translate } from '../i18n/dictionary.js';

import type { BotContext, LocaleCode } from '../sessions/session.js';
import type { MiddlewareFn } from 'telegraf';

const normalizeLocale = (code?: string): LocaleCode => (code?.startsWith('en') ? 'en' : 'fa');

export const localeMiddleware = (): MiddlewareFn<BotContext> => async (ctx, next) => {
  const locale = ctx.session.settings?.language ?? ctx.session.user?.language ?? normalizeLocale(ctx.from?.language_code);
  ctx.locale = locale;
  ctx.session.locale = locale;
  ctx.t = (key, params) => translate(locale, key, params);
  await next();
};
