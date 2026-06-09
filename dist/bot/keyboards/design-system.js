"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.quickReplyRoutes = exports.labels = void 0;
exports.buildReplyKeyboard = buildReplyKeyboard;
exports.buildInlineKeyboard = buildInlineKeyboard;
exports.MainMenuKeyboard = MainMenuKeyboard;
exports.WalletKeyboard = WalletKeyboard;
exports.PaymentKeyboard = PaymentKeyboard;
exports.PurchaseKeyboard = PurchaseKeyboard;
exports.SupportKeyboard = SupportKeyboard;
exports.AdminKeyboard = AdminKeyboard;
exports.SettingsKeyboard = SettingsKeyboard;
exports.InvoiceActionKeyboard = InvoiceActionKeyboard;
exports.paymentSuccessKeyboard = paymentSuccessKeyboard;
exports.paymentFailureKeyboard = paymentFailureKeyboard;
exports.privateTopicArchitecture = privateTopicArchitecture;
exports.labels = {
    home: "🏠 منوی اصلی",
    wallet: "👛 کیف پول",
    walletBalance: "💰 موجودی",
    topup: "💳 شارژ کیف پول",
    transactions: "📜 تراکنش‌ها",
    instantPayment: "⚡ پرداخت آنی",
    walletPayment: "👛 پرداخت از کیف پول",
    shop: "🛒 خرید",
    shopLegacy: "🛒 خرید سرویس",
    buyAgain: "🛒 خرید مجدد",
    coupon: "🎁 کد تخفیف",
    orders: "📦 سفارش‌های من",
    support: "🎫 پشتیبانی",
    settings: "⚙️ تنظیمات",
    retry: "🔄 تلاش مجدد",
    refresh: "🔄 بروزرسانی وضعیت",
    back: "🔙 بازگشت",
    cancel: "❌ لغو عملیات",
    paymentSuccess: "✅ موفق",
    paymentFailure: "❌ ناموفق",
    adminStats: "📊 آمار",
    adminPayments: "💳 پرداخت‌ها",
    adminProducts: "📦 محصولات",
    adminCategories: "📁 دسته‌بندی‌ها",
    adminUsers: "👥 کاربران",
    adminCoupons: "🎟 تخفیف‌ها",
    adminDashboard: "⚙️ داشبورد ادمین",
};
const toneToStyle = {
    primary: "primary",
    success: "success",
    danger: "danger",
};
// Bot API 9.4 supports button colors and custom emoji icons. Telegraf 4.16.3's
// bundled TypeScript types do not expose these fields yet, so builders attach
// the raw API fields directly. Disable style fields only for older self-hosted
// Bot API servers by setting TELEGRAM_BUTTON_STYLE_ENABLED=false.
function buttonDecorations(button) {
    const styleEnabled = process.env.TELEGRAM_BUTTON_STYLE_ENABLED !== "false";
    return {
        ...(styleEnabled && button.tone && button.tone !== "neutral" ? { style: toneToStyle[button.tone] } : {}),
        ...(button.customEmojiId ? { icon_custom_emoji_id: button.customEmojiId } : {}),
    };
}
function replyButton(button) {
    return { text: button.text, ...buttonDecorations(button) };
}
function inlineButton(button) {
    if ("url" in button)
        return { text: button.text, url: button.url, ...buttonDecorations(button) };
    return { text: button.text, callback_data: button.action, ...buttonDecorations(button) };
}
function buildReplyKeyboard(rows) {
    return {
        reply_markup: {
            keyboard: rows.map((row) => row.map(replyButton)),
            resize_keyboard: true,
            is_persistent: true,
        },
    };
}
function buildInlineKeyboard(rows) {
    return { reply_markup: { inline_keyboard: rows.map((row) => row.map(inlineButton)) } };
}
function MainMenuKeyboard(isAdmin = false) {
    const rows = [
        [{ text: exports.labels.shop, tone: "primary" }, { text: exports.labels.wallet, tone: "primary" }],
        [{ text: exports.labels.orders }, { text: exports.labels.coupon }],
        [{ text: exports.labels.support }, { text: exports.labels.settings }],
    ];
    if (isAdmin)
        rows.push([{ text: exports.labels.adminDashboard, tone: "primary" }]);
    return buildReplyKeyboard(rows);
}
function WalletKeyboard() {
    return buildReplyKeyboard([
        [{ text: exports.labels.topup, tone: "primary" }, { text: exports.labels.walletBalance, tone: "success" }],
        [{ text: exports.labels.transactions }, { text: exports.labels.home }],
    ]);
}
function PaymentKeyboard() {
    return buildReplyKeyboard([
        [{ text: exports.labels.retry, tone: "primary" }, { text: exports.labels.support, tone: "danger" }],
        [{ text: exports.labels.home }],
    ]);
}
function PurchaseKeyboard() {
    return buildReplyKeyboard([
        [{ text: exports.labels.shop, tone: "primary" }, { text: exports.labels.coupon }],
        [{ text: exports.labels.wallet }, { text: exports.labels.instantPayment, tone: "success" }],
        [{ text: exports.labels.home }],
    ]);
}
function SupportKeyboard() {
    return buildReplyKeyboard([[{ text: "➕ تیکت جدید", tone: "primary" }, { text: "📂 تیکت‌های من" }], [{ text: exports.labels.home }]]);
}
function AdminKeyboard() {
    return buildReplyKeyboard([
        [{ text: exports.labels.adminStats, tone: "primary" }, { text: exports.labels.adminPayments }],
        [{ text: exports.labels.adminProducts }, { text: exports.labels.adminCategories }],
        [{ text: exports.labels.adminUsers }, { text: exports.labels.adminCoupons }],
        [{ text: exports.labels.settings }, { text: exports.labels.home }],
    ]);
}
function SettingsKeyboard() {
    return buildReplyKeyboard([[{ text: exports.labels.wallet }, { text: exports.labels.support }], [{ text: exports.labels.home }]]);
}
function InvoiceActionKeyboard(paymentLink, backAction) {
    return buildInlineKeyboard([
        [{ text: exports.labels.instantPayment, url: paymentLink, tone: "success" }],
        [{ text: exports.labels.back, action: backAction }, { text: exports.labels.home, action: "home" }],
    ]);
}
function paymentSuccessKeyboard(_type) {
    return buildReplyKeyboard([
        [{ text: exports.labels.home }, { text: exports.labels.buyAgain, tone: "primary" }],
        [{ text: exports.labels.orders, tone: "success" }],
    ]);
}
function paymentFailureKeyboard() {
    return buildReplyKeyboard([
        [{ text: exports.labels.retry, tone: "primary" }, { text: exports.labels.support, tone: "danger" }],
        [{ text: exports.labels.home }],
    ]);
}
exports.quickReplyRoutes = {
    [exports.labels.shop]: { id: "shop.categories" },
    [exports.labels.shopLegacy]: { id: "shop.categories" },
    "🛒 فروشگاه": { id: "shop.categories" },
    [exports.labels.buyAgain]: { id: "shop.categories" },
    [exports.labels.orders]: { id: "account.details" },
    "📦 اکانت‌های من": { id: "account.details" },
    "🆓 اکانت تست": { id: "freeAccount" },
    [exports.labels.refresh]: "refresh",
    "🔄 بروزرسانی": "refresh",
    "👤 پروفایل": { id: "account" },
    [exports.labels.wallet]: { id: "wallet" },
    [exports.labels.walletBalance]: { id: "wallet" },
    "💰 کیف پول": { id: "wallet" },
    [exports.labels.home]: { id: "home" },
    [exports.labels.topup]: { id: "deposit" },
    "➕ شارژ حساب": { id: "deposit" },
    [exports.labels.transactions]: { id: "wallet.history" },
    "💳 تراکنش‌ها": { id: "wallet.history" },
    [exports.labels.instantPayment]: { id: "shop.categories" },
    "➕ تیکت جدید": "newTicket",
    "📂 تیکت‌های من": { id: "support" },
    "🎁 دریافت اکانت تست": "claimFree",
    [exports.labels.adminStats]: { id: "admin.analytics" },
    [exports.labels.adminProducts]: { id: "admin.products" },
    [exports.labels.adminCategories]: { id: "admin.categories" },
    [exports.labels.adminPayments]: { id: "admin.paymentGateway" },
    [exports.labels.adminUsers]: { id: "admin.users" },
    [exports.labels.adminCoupons]: { id: "admin.coupons" },
    [exports.labels.settings]: { id: "admin.settings" },
    [exports.labels.adminDashboard]: { id: "admin.dashboard" },
    [exports.labels.support]: { id: "support" },
    "🎧 پشتیبانی": { id: "support" },
};
function privateTopicArchitecture() {
    return {
        enabled: process.env.TELEGRAM_PRIVATE_TOPICS_ENABLED === "true",
        topics: { payments: "💳 پرداخت‌ها", support: "🎫 پشتیبانی", orders: "📦 سفارش‌ها", announcements: "📢 اطلاعیه‌ها" },
    };
}
