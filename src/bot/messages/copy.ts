export const uxCopy = {
  home: (name = "دوست عزیز") =>
    `سلام ${name ? "👋" : "👋"}\nبه پنل سرویس‌های شما خوش آمدید.\n\nاز اینجا می‌توانید سرویس جدید بخرید، سرویس‌های فعال‌تان را مدیریت کنید یا با پشتیبانی در ارتباط باشید.`,
  account: (input: { balance: string; activeServices: string | number; recentTransactions?: string }) =>
    `👤 حساب من\n\nموجودی کیف پول: ${input.balance}\nسرویس‌های فعال: ${input.activeServices}\nتراکنش‌های اخیر: ${input.recentTransactions ?? "قابل مشاهده"}`,
  checkout: (input: { serviceAmount: string; discount: string; finalAmount: string }) =>
    `🧾 پیش‌فاکتور\n\nمبلغ سرویس: ${input.serviceAmount}\nتخفیف: ${input.discount}\nمبلغ نهایی: ${input.finalAmount}\n\nقبل از پرداخت، اطلاعات بالا را بررسی کنید.`,
  serviceInfoError: "⚠️ مشکلی در دریافت اطلاعات سرویس پیش آمد.\nلطفاً دوباره تلاش کنید. اگر مشکل ادامه داشت، با پشتیبانی تماس بگیرید.",
  couponInfo: "🎟 کد تخفیف\n\nکد تخفیف هنگام خرید سرویس اعمال می‌شود.",
  adminXrayClientMissing: (id: string) => `⚠️ کلاینت در پنل Xray پیدا نشد.\nشناسه: ${id}\nوضعیت پیشنهادی: تعمیر کلاینت`,
} as const;
