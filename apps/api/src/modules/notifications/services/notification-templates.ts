import type { NotificationType } from '@prisma/client';

const templates: Record<string, (vars: Record<string, string>) => { title: string; body: string }> = {
  service_expiring_3d: () => ({
    title: 'یادآوری تمدید سرویس',
    body: 'سرویس شما تا ۳ روز دیگر منقضی می‌شود. برای جلوگیری از قطع، تمدید کنید.',
  }),
  service_expiring_24h: () => ({
    title: 'انقضای نزدیک سرویس',
    body: 'سرویس شما تا ۲۴ ساعت دیگر منقضی می‌شود.',
  }),
  service_expired: () => ({
    title: 'سرویس منقضی شد',
    body: 'سرویس شما منقضی شده است. از منو می‌توانید تمدید کنید.',
  }),
  traffic_80: (v) => ({
    title: 'هشدار مصرف ترافیک',
    body: `حدود ${v.percent ?? '80'}٪ ترافیک سرویس مصرف شده است.`,
  }),
  traffic_95: (v) => ({
    title: 'هشدار بحرانی ترافیک',
    body: `حدود ${v.percent ?? '95'}٪ ترافیک سرویس مصرف شده است.`,
  }),
  deposit_success: (v) => ({
    title: 'واریز موفق',
    body: `مبلغ ${v.amountToman ?? '—'} تومان به کیف پول شما واریز شد.`,
  }),
  purchase_confirmation: () => ({
    title: 'خرید تأیید شد',
    body: 'سرویس جدید شما فعال شد. از بخش سرویس‌ها لینک را دریافت کنید.',
  }),
  referral_reward: (v) => ({
    title: 'پاداش دعوت',
    body: `پاداش دعوت به مبلغ ${v.amountToman ?? '—'} تومان به کیف پول شما اضافه شد.`,
  }),
  ticket_reply: (v) => ({
    title: 'پاسخ پشتیبانی',
    body: `تیکت «${v.subject ?? '—'}» پاسخ داده شد.`,
  }),
  ticket_created: () => ({
    title: 'تیکت ثبت شد',
    body: 'درخواست پشتیبانی شما ثبت شد. به زودی پاسخ می‌دهیم.',
  }),
  system_announcement: (v) => ({
    title: v.title ?? 'اطلاعیه',
    body: v.body ?? '',
  }),
  inactivity_reminder: () => ({
    title: 'دلتنگیم!',
    body: 'مدتی است سر نزده‌اید. سرویس‌ها و پیشنهادها در منو منتظرند.',
  }),
};

export const renderNotificationTemplate = (
  templateKey: string,
  variables: Record<string, string> = {},
): { title: string; body: string } => {
  const fn = templates[templateKey];
  if (!fn) {
    return {
      title: variables.title ?? 'اطلاع‌رسانی',
      body: variables.body ?? '',
    };
  }
  return fn(variables);
};

export const templateKeyForType = (type: NotificationType): string => {
  const map: Partial<Record<NotificationType, string>> = {
    SERVICE_EXPIRING: 'service_expiring_3d',
    SERVICE_EXPIRED: 'service_expired',
    TRAFFIC_WARNING: 'traffic_80',
    DEPOSIT_SUCCESS: 'deposit_success',
    PURCHASE_CONFIRMATION: 'purchase_confirmation',
    REFERRAL_REWARD: 'referral_reward',
    SYSTEM_ANNOUNCEMENT: 'system_announcement',
    ADMIN_BROADCAST: 'system_announcement',
    INACTIVITY_REMINDER: 'inactivity_reminder',
  };
  return map[type] ?? 'system_announcement';
};
