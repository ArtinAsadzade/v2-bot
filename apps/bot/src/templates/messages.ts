import { code } from '../formatters/markdown.js';
import { formatPersianDate, formatToman } from '../formatters/date.js';
import { statusCard } from '../ui/components.js';

import type { BotContext } from '../sessions/session.js';

export const welcomeTemplate = (ctx: BotContext): string =>
  `${ctx.t('welcome.title', { name: ctx.from?.first_name ?? 'دوست' })}\n\n${ctx.t('welcome.body')}`;

export const mainMenuTemplate = (ctx: BotContext): string => `${ctx.t('menu.title')}\n\n${ctx.t('menu.subtitle')}`;

export const profileTemplate = (ctx: BotContext): string => {
  const user = ctx.session.user;
  return statusCard({
    title: ctx.t('profile.title'),
    rows: [
      [ctx.t('profile.wallet'), formatToman(0)],
      [ctx.t('profile.services'), '۰'],
      [ctx.t('profile.referrals'), user?.referralCount ?? 0],
      [ctx.t('profile.joined'), user?.createdAt ? formatPersianDate(user.createdAt) : '—'],
      [ctx.t('profile.level'), ctx.t('profile.levelValue')],
    ],
  });
};

export const referralTemplate = (ctx: BotContext, link: string): string => {
  const user = ctx.session.user;
  return [
    ctx.t('referral.title'),
    ctx.t('referral.body'),
    '',
    `• ${ctx.t('referral.count')}: ${user?.referralCount ?? 0}`,
    `• کد دعوت: ${code(user?.referralCode ?? '—')}`,
    '',
    code(link),
  ].join('\n');
};

export const placeholderTemplate = (ctx: BotContext, title?: string): string =>
  `✨ ${title ?? ctx.t('placeholder.title')}\n\n${ctx.t('placeholder.body')}`;
