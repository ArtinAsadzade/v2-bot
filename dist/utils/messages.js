"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MESSAGES = exports.UI_EMOJI = void 0;
exports.screenMessage = screenMessage;
exports.successMessage = successMessage;
exports.errorMessage = errorMessage;
exports.warningMessage = warningMessage;
exports.infoMessage = infoMessage;
exports.paymentSummaryMessage = paymentSummaryMessage;
exports.purchaseSuccessMessage = purchaseSuccessMessage;
exports.walletSummaryMessage = walletSummaryMessage;
exports.accountSummaryMessage = accountSummaryMessage;
exports.safeUserErrorMessage = safeUserErrorMessage;
exports.UI_EMOJI = {
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
};
const divider = "━━━━━━━━━━━━━━━━";
const money = (value) => `${value.toLocaleString("fa-IR")} تومان`;
const clean = (value) => (value && value.trim() ? value.trim() : "—");
function screenMessage(options) {
    const icon = options.tone ? exports.UI_EMOJI[options.tone] : "🌿";
    return [`${icon} ${options.title}`, "", options.description, options.body ? `\n${divider}\n${options.body}` : "", `\n${divider}\n${options.actionHint}`]
        .filter(Boolean)
        .join("\n");
}
function successMessage(title, description = "درخواست شما با موفقیت انجام شد.", actionHint = "برای ادامه، یکی از گزینه‌های زیر را انتخاب کنید.") {
    return screenMessage({ tone: "SUCCESS", title, description, actionHint });
}
function errorMessage(title = "انجام درخواست ممکن نیست", description = "در حال حاضر امکان انجام این درخواست وجود ندارد.", actionHint = "لطفاً دوباره تلاش کنید یا با پشتیبانی در ارتباط باشید.") {
    return screenMessage({ tone: "ERROR", title, description, actionHint });
}
function warningMessage(title, description, actionHint = "لطفاً مورد خواسته‌شده را بررسی و دوباره اقدام کنید.") {
    return screenMessage({ tone: "WARNING", title, description, actionHint });
}
function infoMessage(title, description, actionHint = "برای ادامه، یکی از گزینه‌های زیر را انتخاب کنید.") {
    return screenMessage({ title, description, actionHint });
}
function paymentSummaryMessage(data) {
    return screenMessage({
        tone: "PAYMENT",
        title: "پیش‌فاکتور پرداخت",
        description: "جزئیات سفارش شما آماده است.",
        body: [
            data.productTitle ? `${exports.UI_EMOJI.PRODUCT} محصول: ${data.productTitle}` : undefined,
            `💰 مبلغ: ${money(data.amount)}`,
            data.couponLine !== undefined ? `🏷 کد تخفیف: ${clean(data.couponLine)}` : undefined,
            data.discountAmount !== undefined ? `🎟 تخفیف: ${money(data.discountAmount)}` : undefined,
            data.payableAmount !== undefined ? `✅ مبلغ نهایی: ${money(data.payableAmount)}` : undefined,
            data.balance !== undefined ? `موجودی کیف پول: ${money(data.balance)}` : undefined,
            data.shortage ? `${exports.UI_EMOJI.WARNING} کسری موجودی: ${money(data.shortage)}` : data.balance !== undefined ? `${exports.UI_EMOJI.SUCCESS} موجودی شما برای خرید کافی است.` : undefined,
            "",
            `⚡ روش پرداخت: کیف پول${data.gatewayEnabled ? "، پرداخت آنی" : ""}`,
        ].filter((line) => line !== undefined).join("\n"),
        actionHint: "لطفاً روش پرداخت را انتخاب کنید.",
    });
}
function purchaseSuccessMessage(data) {
    return screenMessage({
        tone: "SUCCESS",
        title: "خرید با موفقیت انجام شد",
        description: "اطلاعات سرویس شما آماده استفاده است.",
        body: [`📦 سرویس:\n${data.productTitle}`, `👤 نام کاربری:\n${clean(data.username)}`, `🔗 لینک اشتراک:\n${clean(data.subscriptionLink)}`, `⚙️ لینک کانفیگ:\n${clean(data.config)}`, `📅 تاریخ انقضا:\n${data.expiresAt ? data.expiresAt.toLocaleDateString("fa-IR") : "—"}`].join("\n\n"),
        actionHint: "این اطلاعات همیشه از بخش اکانت‌های من در دسترس است.",
    });
}
function walletSummaryMessage(balance, body) {
    return screenMessage({ tone: "WALLET", title: "کیف پول شما", description: `موجودی فعلی شما ${money(balance)} است.`, body, actionHint: "برای ادامه، یکی از گزینه‌های زیر را انتخاب کنید." });
}
function accountSummaryMessage(data) {
    return screenMessage({
        tone: "USER",
        title: "خلاصه حساب کاربری",
        description: "وضعیت حساب شما در یک نگاه آماده است.",
        body: [`موجودی کیف پول: ${money(data.balance)}`, `تعداد دعوت‌ها: ${data.referralCount.toLocaleString("fa-IR")} نفر`, `جوایز فعال: ${data.freeRewards.toLocaleString("fa-IR")}`, `اکانت‌های فعال: ${data.activeAccounts.toLocaleString("fa-IR")}`, data.recentOrders !== undefined ? `خریدهای اخیر: ${data.recentOrders.toLocaleString("fa-IR")} سفارش` : undefined, data.pendingReferralAmount !== undefined ? `پاداش قابل برداشت: ${money(data.pendingReferralAmount)}` : undefined].filter(Boolean).join("\n"),
        actionHint: "از میان اقدام‌های سریع زیر انتخاب کنید.",
    });
}
function safeUserErrorMessage() {
    return errorMessage("درخواست انجام نشد", "در ثبت یا دریافت اطلاعات مشکلی پیش آمد.", "لطفاً مقدار را بررسی کنید و دوباره بفرستید.");
}
exports.MESSAGES = {
    WELCOME: infoMessage("خوش آمدید", "سلام؛ به ربات فروش سرویس خوش آمدید.", "برای شروع، یکی از گزینه‌های منو را انتخاب کنید."),
    HOME: infoMessage("منوی اصلی", "بخش‌های اصلی ربات آماده هستند.", "از منوی زیر بخش موردنظر را انتخاب کنید."),
    CANCELLED: warningMessage("عملیات لغو شد", "درخواست فعلی متوقف شد.", "هر زمان آماده بودید از منو ادامه دهید."),
    UNKNOWN: warningMessage("گزینه نامعتبر", "گزینه انتخاب‌شده شناخته نشد.", "لطفاً از دکمه‌های منو استفاده کنید."),
};
