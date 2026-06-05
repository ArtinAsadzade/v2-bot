import { code } from '../formatters/markdown.js';
import { formatToman } from '../formatters/date.js';
import { statusCard } from '../ui/components.js';

import type { BotContext } from '../sessions/session.js';

export type ReferralStatsDto = {
  referralCode: string;
  inviteLink: string;
  totalInvites: number;
  rewardedCount: number;
  pendingCount: number;
  totalRewardToman: string;
};

export const referralDashboardTemplate = (ctx: BotContext, stats: ReferralStatsDto): string =>
  [
    '🎁 ' + ctx.t('referral.title'),
    '',
    `• ${ctx.t('referral.count')}: ${stats.totalInvites}`,
    `• پاداش‌یافته: ${stats.rewardedCount}`,
    `• در انتظار: ${stats.pendingCount}`,
    `• مجموع پاداش: ${formatToman(Number(stats.totalRewardToman))}`,
    '',
    `کد: ${code(stats.referralCode)}`,
    code(stats.inviteLink),
  ].join('\n');

export const supportHubTemplate = (ctx: BotContext): string =>
  statusCard({
    title: '📩 ' + ctx.t('menu.support'),
    rows: [
      ['وضعیت', 'آماده ثبت تیکت'],
      ['دسته‌ها', 'پرداخت · فنی · حساب · عمومی'],
    ],
  });

export const ticketListTemplate = (
  tickets: Array<{ subject: string; status: string; updatedAt: string }>,
): string => {
  if (tickets.length === 0) return '📭 هنوز تیکتی ثبت نکرده‌اید.';
  return tickets
    .slice(0, 8)
    .map((t, i) => `${i + 1}. ${t.subject} — ${t.status}`)
    .join('\n');
};

export const notificationsTemplate = (
  items: Array<{ title: string; body: string; sentAt: string | null }>,
): string => {
  if (items.length === 0) return '🔔 اعلانی ندارید.';
  return items
    .slice(0, 5)
    .map((n) => `• ${n.title}\n  ${n.body.slice(0, 80)}`)
    .join('\n\n');
};
