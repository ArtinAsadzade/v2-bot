import { apiClient } from '../services/api-client.js';

import type { BotContext, LocaleCode } from '../sessions/session.js';
import type { MiddlewareFn } from 'telegraf';

const normalizeLanguage = (languageCode?: string): LocaleCode => (languageCode?.startsWith('en') ? 'en' : 'fa');

const startPayload = (text?: string): string | undefined => {
  if (!text?.startsWith('/start')) return undefined;
  const [, payload] = text.split(/\s+/u);
  return payload?.trim();
};

export const userSyncMiddleware = (): MiddlewareFn<BotContext> => async (ctx, next) => {
  if (!ctx.from || ctx.from.is_bot) return next();
  const referralCode = ctx.message && 'text' in ctx.message ? startPayload(ctx.message.text) : undefined;
  const user = await apiClient.syncTelegramUser(
    {
      telegramId: String(ctx.from.id),
      ...(ctx.from.username !== undefined ? { username: ctx.from.username } : {}),
      firstName: ctx.from.first_name,
      ...(ctx.from.last_name !== undefined ? { lastName: ctx.from.last_name } : {}),
      ...(ctx.from.language_code !== undefined ? { languageCode: ctx.from.language_code } : {}),
      ...(referralCode !== undefined ? { referralCode } : {}),
    },
    ctx.session.correlationId,
  );
  const language = normalizeLanguage(user.languageCode ?? ctx.from.language_code);
  ctx.session.user = {
    id: user.id,
    telegramId: user.telegramId,
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
    language,
    referralCode: user.referralCode,
    referralCount: user.referralCount,
    createdAt: user.createdAt,
  };
  ctx.session.settings.language = ctx.session.settings.language ?? language;
  await next();
};
