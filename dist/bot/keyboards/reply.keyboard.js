"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.replyKeyboard = replyKeyboard;
exports.replyKeyboardSignature = replyKeyboardSignature;
exports.quickReplyTarget = quickReplyTarget;
const telegraf_1 = require("telegraf");
const keyboards = {
    home: [
        ["🛒 فروشگاه", "📦 اکانت‌های من"],
        ["👤 پروفایل", "💰 کیف پول"],
        ["🆓 اکانت تست", "🎧 پشتیبانی"],
    ],
    shop: [
        ["🛒 فروشگاه", "📦 اکانت‌های من"],
        ["🆓 اکانت تست", "🔄 بروزرسانی"],
    ],
    profile: [
        ["👤 پروفایل", "💰 کیف پول"],
        ["📦 اکانت‌های من", "🏠 منوی اصلی"],
    ],
    wallet: [
        ["➕ شارژ حساب", "💳 تراکنش‌ها"],
        ["🏠 منوی اصلی"],
    ],
    support: [
        ["➕ تیکت جدید", "📂 تیکت‌های من"],
        ["🏠 منوی اصلی"],
    ],
    freeAccount: [
        ["🎁 دریافت اکانت تست", "📦 اکانت‌های من"],
        ["🏠 منوی اصلی"],
    ],
    admin: [
        ["📊 آمار", "🛒 محصولات"],
        ["📂 دسته‌بندی‌ها", "💳 پرداخت‌ها"],
        ["⚙️ تنظیمات", "🏠 منوی اصلی"],
    ],
};
function replyKeyboard(scope) {
    return telegraf_1.Markup.keyboard(keyboards[scope]).resize().persistent();
}
function replyKeyboardSignature(scope) {
    return keyboards[scope].map((row) => row.join("|")).join("||");
}
function quickReplyTarget(text) {
    const targets = {
        "🛒 فروشگاه": { id: "shop.categories" },
        "📦 اکانت‌های من": { id: "account.details" },
        "🆓 اکانت تست": { id: "freeAccount" },
        "🔄 بروزرسانی": "refresh",
        "👤 پروفایل": { id: "account" },
        "💰 کیف پول": { id: "wallet" },
        "🏠 منوی اصلی": { id: "home" },
        "➕ شارژ حساب": { id: "deposit" },
        "💳 تراکنش‌ها": { id: "wallet.history" },
        "➕ تیکت جدید": "newTicket",
        "📂 تیکت‌های من": { id: "support" },
        "🎁 دریافت اکانت تست": "claimFree",
        "📊 آمار": { id: "admin.analytics" },
        "🛒 محصولات": { id: "admin.products" },
        "📂 دسته‌بندی‌ها": { id: "admin.categories" },
        "💳 پرداخت‌ها": { id: "admin.paymentGateway" },
        "⚙️ تنظیمات": { id: "admin.settings" },
        "🎧 پشتیبانی": { id: "support" },
    };
    return targets[text];
}
