export const serviceNotFoundMessage = () => "⚠️ سرویس پیدا نشد.";
export const xraySubscriptionMessage = (url: string) => `🔗 لینک اشتراک شما\n\n${url}\n\nاین لینک را داخل برنامه‌هایی مثل v2rayNG, Streisand, Hiddify یا Nekobox وارد کنید.`;
export const xrayConfigsSentMessage = (count: number) => `✅ تمام کانفیگ‌های شما ارسال شد.\n\nتعداد کانفیگ‌ها:\n${count.toLocaleString("fa-IR")}`;
export const xrayRenewedMessage = (date: Date) => `✅ سرویس با موفقیت تمدید شد.\n\nاعتبار جدید: ${date.toLocaleDateString("fa-IR")}`;
export const xrayRenewalInvoiceMessage = (amount: number) => `🧾 فاکتور تمدید آماده شد\n\n💰 مبلغ: ${amount.toLocaleString("fa-IR")} تومان\n\nبرای پرداخت روی دکمه زیر بزنید.`;
