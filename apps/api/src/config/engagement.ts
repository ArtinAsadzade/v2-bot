import type { Env } from './env.js';

export type EngagementConfig = {
  referralCashbackBps: number;
  referralFixedBonusToman: bigint;
  referralRewardDelayHours: number;
  serviceGracePeriodHours: number;
  notificationCooldownSeconds: number;
  ticketRateLimitPerHour: number;
  inactivityReminderDays: number;
};

export const createEngagementConfig = (env: Env): EngagementConfig => ({
  referralCashbackBps: env.REFERRAL_CASHBACK_BPS,
  referralFixedBonusToman: BigInt(env.REFERRAL_FIXED_BONUS_TOMAN),
  referralRewardDelayHours: env.REFERRAL_REWARD_DELAY_HOURS,
  serviceGracePeriodHours: env.SERVICE_GRACE_PERIOD_HOURS,
  notificationCooldownSeconds: env.NOTIFICATION_COOLDOWN_SECONDS,
  ticketRateLimitPerHour: env.TICKET_RATE_LIMIT_PER_HOUR,
  inactivityReminderDays: env.INACTIVITY_REMINDER_DAYS,
});
