"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.quickReplyRoutes = exports.labels = void 0;
exports.buildReplyKeyboard = buildReplyKeyboard;
exports.buildInlineKeyboard = buildInlineKeyboard;
exports.MainMenuKeyboard = MainMenuKeyboard;
exports.UserKeyboard = UserKeyboard;
exports.WalletKeyboard = WalletKeyboard;
exports.ShopKeyboard = ShopKeyboard;
exports.PurchaseKeyboard = PurchaseKeyboard;
exports.SupportKeyboard = SupportKeyboard;
exports.AdminKeyboard = AdminKeyboard;
exports.AdminProductsKeyboard = AdminProductsKeyboard;
exports.AdminPaymentsKeyboard = AdminPaymentsKeyboard;
exports.AdminUsersKeyboard = AdminUsersKeyboard;
exports.AdminSettingsKeyboard = AdminSettingsKeyboard;
exports.WalletActionKeyboard = WalletActionKeyboard;
exports.PaymentKeyboard = PaymentKeyboard;
exports.SettingsKeyboard = SettingsKeyboard;
exports.InvoiceActionKeyboard = InvoiceActionKeyboard;
exports.paymentSuccessKeyboard = paymentSuccessKeyboard;
exports.paymentFailureKeyboard = paymentFailureKeyboard;
exports.privateTopicArchitecture = privateTopicArchitecture;
exports.labels = {
    home: "🏠 خانه",
    userMenu: "🏠 منوی کاربر",
    wallet: "💳 کیف پول",
    walletBalance: "💳 موجودی فعلی",
    topup: "➕ شارژ کیف پول",
    transactions: "📜 تاریخچه تراکنش‌ها",
    instantPayment: "⚡ پرداخت آنی",
    walletPayment: "💳 پرداخت با کیف پول",
    shop: "🛒 فروشگاه",
    shopLegacy: "🛒 فروشگاه",
    buyAgain: "🛒 خرید مجدد",
    coupon: "🎟 تخفیف‌ها",
    account: "👤 حساب کاربری",
    freeAccount: "🆓 اکانت تست",
    referral: "🎁 دعوت دوستان",
    orders: "📦 اکانت‌های من",
    support: "🎫 پشتیبانی",
    guide: "📘 راهنما",
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
    adminCategories: "📂 دسته‌بندی‌ها",
    adminInventory: "🗄 موجودی اکانت‌ها",
    adminUsers: "👥 کاربران",
    adminTickets: "🎫 تیکت‌ها",
    adminNotifications: "📢 اطلاع‌رسانی",
    adminCoupons: "🎟 کدهای تخفیف",
    adminDashboard: "🛡 پنل مدیریت",
};
const toneToStyle = {
    primary: "primary",
    success: "success",
    danger: "danger",
    warning: "warning",
};
// Compatibility check (2026-06-13): official Bot API 9.4 exposes
// KeyboardButton/InlineKeyboardButton `style` and `icon_custom_emoji_id`, while
// Telegraf 4.16.3 can send unknown raw fields but its bundled types lag behind.
// The premium fields are therefore opt-in raw payload decorations with a safe
// fallback: set TELEGRAM_BUTTON_STYLE_ENABLED=false or TELEGRAM_CUSTOM_EMOJI_ENABLED=false
// for older self-hosted Bot API servers or bots that cannot use premium emoji.
function buttonDecorations(button) {
    const styleEnabled = process.env.TELEGRAM_BUTTON_STYLE_ENABLED !== "false";
    const customEmojiEnabled = process.env.TELEGRAM_CUSTOM_EMOJI_ENABLED === "true";
    return {
        ...(styleEnabled && button.tone && button.tone !== "neutral" ? { style: toneToStyle[button.tone] } : {}),
        ...(customEmojiEnabled && button.customEmojiId ? { icon_custom_emoji_id: button.customEmojiId } : {}),
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
        [{ text: exports.labels.shop }, { text: exports.labels.wallet }],
        [{ text: exports.labels.orders }, { text: exports.labels.freeAccount }],
        [{ text: exports.labels.guide }, { text: exports.labels.support }],
        [{ text: exports.labels.referral }, { text: exports.labels.account }],
    ];
    if (isAdmin)
        rows.push([{ text: exports.labels.adminDashboard }]);
    return buildReplyKeyboard(rows);
}
function UserKeyboard() {
    return MainMenuKeyboard();
}
function WalletKeyboard() {
    return MainMenuKeyboard();
}
function ShopKeyboard() {
    return MainMenuKeyboard();
}
function PurchaseKeyboard() {
    return ShopKeyboard();
}
function SupportKeyboard() {
    return MainMenuKeyboard();
}
function AdminKeyboard() {
    return buildReplyKeyboard([
        [{ text: exports.labels.adminStats }, { text: exports.labels.adminPayments }],
        [{ text: exports.labels.adminProducts }, { text: exports.labels.adminCategories }],
        [{ text: exports.labels.adminInventory }, { text: exports.labels.adminUsers }],
        [{ text: exports.labels.adminCoupons }, { text: exports.labels.adminTickets }],
        [{ text: exports.labels.adminNotifications }, { text: exports.labels.settings }],
        [{ text: exports.labels.userMenu }],
    ]);
}
function AdminProductsKeyboard() {
    return AdminKeyboard();
}
function AdminPaymentsKeyboard() {
    return AdminKeyboard();
}
function AdminUsersKeyboard() {
    return AdminKeyboard();
}
function AdminSettingsKeyboard() {
    return AdminKeyboard();
}
function WalletActionKeyboard() {
    return buildInlineKeyboard([
        [{ text: exports.labels.topup, action: "nav:deposit", tone: "primary" }],
        [{ text: exports.labels.transactions, action: "nav:wallet.history" }],
    ]);
}
function PaymentKeyboard() {
    return MainMenuKeyboard();
}
function SettingsKeyboard() {
    return AdminKeyboard();
}
function InvoiceActionKeyboard(paymentLink, backAction) {
    return buildInlineKeyboard([
        [{ text: exports.labels.instantPayment, url: paymentLink, tone: "success" }],
        [
            { text: exports.labels.back, action: backAction },
            { text: exports.labels.home, action: "nav:home" },
        ],
    ]);
}
function paymentSuccessKeyboard(_type) {
    return buildInlineKeyboard([
        [{ text: exports.labels.orders, action: "nav:account.details", tone: "success" }, { text: exports.labels.buyAgain, action: "nav:shop.categories", tone: "primary" }],
        [{ text: exports.labels.home, action: "nav:home" }],
    ]);
}
function paymentFailureKeyboard() {
    return buildInlineKeyboard([
        [{ text: exports.labels.retry, action: "nav:deposit", tone: "primary" }, { text: exports.labels.support, action: "nav:support", tone: "danger" }],
        [{ text: exports.labels.home, action: "nav:home" }],
    ]);
}
exports.quickReplyRoutes = {
    [exports.labels.shop]: { id: "shop.categories" },
    [exports.labels.buyAgain]: { id: "shop.categories" },
    [exports.labels.orders]: { id: "account.details" },
    [exports.labels.account]: { id: "account" },
    [exports.labels.freeAccount]: { id: "freeAccount" },
    [exports.labels.guide]: { id: "productGuide" },
    [exports.labels.referral]: { id: "referral" },
    "🎁 اکانت تست": { id: "freeAccount" },
    [exports.labels.refresh]: "refresh",
    [exports.labels.retry]: { id: "deposit" },
    "🔄 بروزرسانی": "refresh",
    "👤 پروفایل": { id: "account" },
    [exports.labels.wallet]: { id: "wallet" },
    [exports.labels.walletBalance]: { id: "wallet" },
    "💸 برداشت‌ها": { id: "referral" },
    "🎁 پاداش‌ها": { id: "referral" },
    [exports.labels.home]: { id: "home" },
    [exports.labels.userMenu]: { id: "home" },
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
    [exports.labels.adminInventory]: { id: "admin.accounts" },
    [exports.labels.adminPayments]: { id: "admin.paymentGateway" },
    [exports.labels.adminUsers]: { id: "admin.users" },
    [exports.labels.adminTickets]: { id: "admin.tickets" },
    [exports.labels.adminNotifications]: { id: "admin.notifications" },
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
