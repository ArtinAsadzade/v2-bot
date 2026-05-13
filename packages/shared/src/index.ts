import { z } from 'zod';

export const toman = new Intl.NumberFormat('fa-IR');

export const telegramIdSchema = z.string().min(3).max(32);
export const trafficGbSchema = z.number().int().min(1).max(10_000);
export const uuidSchema = z.string().uuid();

export const purchaseRequestSchema = z.object({
  productId: uuidSchema,
  trafficGb: trafficGbSchema,
  idempotencyKey: z.string().min(16).max(128),
});

export type PurchaseRequestDto = z.infer<typeof purchaseRequestSchema>;

export const adminWalletChargeSchema = z.object({
  userId: uuidSchema,
  amountToman: z.number().int().positive().max(1_000_000_000),
  reason: z.string().min(3).max(240),
});

export type AdminWalletChargeDto = z.infer<typeof adminWalletChargeSchema>;

export const fa = {
  mainMenuTitle: 'به پنل اختصاصی شما خوش آمدید ✨',
  wallet: 'کیف پول',
  marketplace: 'خرید سرویس',
  services: 'سرویس‌های من',
  support: 'پشتیبانی',
  profile: 'پروفایل',
  back: 'بازگشت',
  copyConfig: 'کپی کانفیگ',
  copySubscription: 'کپی لینک اشتراک',
  buyNow: 'خرید سریع',
  insufficientBalance: 'موجودی کیف پول کافی نیست. لطفاً ابتدا شارژ کنید.',
  purchaseSuccess: 'سرویس شما با موفقیت آماده شد 🎉',
} as const;

export const serviceStatuses = ['ACTIVE', 'PAUSED', 'EXPIRED', 'DELETED'] as const;
export type ServiceStatus = (typeof serviceStatuses)[number];
