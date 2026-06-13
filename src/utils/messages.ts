export const UI_EMOJI = {
  SUCCESS: "✅",
  ERROR: "❌",
  WARNING: "⚠️",
  PAYMENT: "💳",
  PRODUCT: "📦",
  WALLET: "👛",
  SUPPORT: "📞",
  USER: "👤",
  ADMIN: "🛡",
  SETTINGS: "⚙️",
  STATS: "📊",
} as const;

const divider = "━━━━━━━━━━━━━━━━";
const money = (value: number) => `${value.toLocaleString("fa-IR")} تومان`;
const clean = (value?: string | null) => (value && value.trim() ? value.trim() : "—");

export type MessageTone = keyof Pick<typeof UI_EMOJI, "SUCCESS" | "ERROR" | "WARNING" | "PAYMENT" | "WALLET" | "SUPPORT" | "USER" | "ADMIN" | "STATS" | "SETTINGS" | "PRODUCT">;

export function screenMessage(options: { tone?: MessageTone; title: string; description: string; actionHint: string; body?: string }) {
  const icon = options.tone ? UI_EMOJI[options.tone] : "🌿";
  return [`${icon} ${options.title}`, "", options.description, options.body ? `\n${divider}\n${options.body}` : "", `\n${divider}\n${options.actionHint}`]
    .filter(Boolean)
    .join("\n");
}

export function successMessage(title: string, description = "درخواست شما با موفقیت انجام شد.", actionHint = "برای ادامه، یکی از گزینه‌های زیر را انتخاب کنید.") {
  return screenMessage({ tone: "SUCCESS", title, description, actionHint });
}

export function errorMessage(title = "انجام درخواست ممکن نیست", description = "در حال حاضر امکان انجام این درخواست وجود ندارد.", actionHint = "لطفاً دوباره تلاش کنید یا با پشتیبانی در ارتباط باشید.") {
  return screenMessage({ tone: "ERROR", title, description, actionHint });
}

export function warningMessage(title: string, description: string, actionHint = "لطفاً مورد خواسته‌شده را بررسی و دوباره اقدام کنید.") {
  return screenMessage({ tone: "WARNING", title, description, actionHint });
}

export function infoMessage(title: string, description: string, actionHint = "برای ادامه، یکی از گزینه‌های زیر را انتخاب کنید.") {
  return screenMessage({ title, description, actionHint });
}

export function paymentSummaryMessage(data: { productTitle?: string; amount: number; discountAmount?: number; payableAmount?: number; balance?: number; shortage?: number; couponLine?: string; gatewayEnabled?: boolean }) {
  return screenMessage({
    tone: "PAYMENT",
    title: "پیش‌فاکتور پرداخت",
    description: "جزئیات سفارش شما آماده است.",
    body: [
      data.productTitle ? `${UI_EMOJI.PRODUCT} محصول: ${data.productTitle}` : undefined,
      `💰 مبلغ: ${money(data.amount)}`,
      data.couponLine !== undefined ? `🏷 کد تخفیف: ${clean(data.couponLine)}` : undefined,
      data.discountAmount !== undefined ? `🎟 تخفیف: ${money(data.discountAmount)}` : undefined,
      data.payableAmount !== undefined ? `✅ مبلغ نهایی: ${money(data.payableAmount)}` : undefined,
      data.balance !== undefined ? `موجودی کیف پول: ${money(data.balance)}` : undefined,
      data.shortage ? `${UI_EMOJI.WARNING} کسری موجودی: ${money(data.shortage)}` : data.balance !== undefined ? `${UI_EMOJI.SUCCESS} موجودی شما برای خرید کافی است.` : undefined,
      "",
      `⚡ روش پرداخت: کیف پول${data.gatewayEnabled ? "، پرداخت آنی" : ""}`,
    ].filter((line) => line !== undefined).join("\n"),
    actionHint: "لطفاً روش پرداخت را انتخاب کنید.",
  });
}

export function purchaseSuccessMessage(data: { productTitle: string; username?: string | null; subscriptionLink?: string | null; config?: string | null; expiresAt?: Date | null }) {
  return screenMessage({
    tone: "SUCCESS",
    title: "خرید با موفقیت انجام شد",
    description: "اطلاعات سرویس شما آماده استفاده است.",
    body: [`📦 محصول: ${data.productTitle}`, `👤 نام کاربری: ${clean(data.username)}`, `🔗 لینک اشتراک: ${clean(data.subscriptionLink)}`, `⚙️ کانفیگ: ${clean(data.config)}`, `📅 انقضا: ${data.expiresAt ? data.expiresAt.toLocaleDateString("fa-IR") : "—"}`].join("\n\n"),
    actionHint: "این اطلاعات همیشه از بخش اکانت‌های من در دسترس است.",
  });
}

export function walletSummaryMessage(balance: number, body?: string) {
  return screenMessage({ tone: "WALLET", title: "کیف پول شما", description: `موجودی فعلی شما ${money(balance)} است.`, body, actionHint: "برای ادامه، یکی از گزینه‌های زیر را انتخاب کنید." });
}

export function accountSummaryMessage(data: { balance: number; referralCount: number; freeRewards: number; activeAccounts: number; recentOrders?: number; pendingReferralAmount?: number }) {
  return screenMessage({
    tone: "USER",
    title: "خلاصه حساب کاربری",
    description: "وضعیت حساب شما در یک نگاه آماده است.",
    body: [`موجودی کیف پول: ${money(data.balance)}`, `تعداد دعوت‌ها: ${data.referralCount.toLocaleString("fa-IR")} نفر`, `جوایز فعال: ${data.freeRewards.toLocaleString("fa-IR")}`, `اکانت‌های فعال: ${data.activeAccounts.toLocaleString("fa-IR")}`, data.recentOrders !== undefined ? `خریدهای اخیر: ${data.recentOrders.toLocaleString("fa-IR")} سفارش` : undefined, data.pendingReferralAmount !== undefined ? `پاداش قابل برداشت: ${money(data.pendingReferralAmount)}` : undefined].filter(Boolean).join("\n"),
    actionHint: "از میان اقدام‌های سریع زیر انتخاب کنید.",
  });
}

export function safeUserErrorMessage() {
  return errorMessage("درخواست انجام نشد", "در ثبت یا دریافت اطلاعات مشکلی پیش آمد.", "لطفاً مقدار را بررسی کنید و دوباره بفرستید.");
}

export const MESSAGES = {
  WELCOME: infoMessage("خوش آمدید", "سلام؛ به ربات فروش سرویس خوش آمدید.", "برای شروع، یکی از گزینه‌های منو را انتخاب کنید."),
  HOME: infoMessage("منوی اصلی", "بخش‌های اصلی ربات آماده هستند.", "از منوی زیر بخش موردنظر را انتخاب کنید."),
  CANCELLED: warningMessage("عملیات لغو شد", "درخواست فعلی متوقف شد.", "هر زمان آماده بودید از منو ادامه دهید."),
  UNKNOWN: warningMessage("گزینه نامعتبر", "گزینه انتخاب‌شده شناخته نشد.", "لطفاً از دکمه‌های منو استفاده کنید."),
};
