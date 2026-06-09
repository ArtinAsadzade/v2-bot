"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.homeKeyboard = homeKeyboard;
exports.navigationKeyboard = navigationKeyboard;
const telegraf_1 = require("telegraf");
const design_system_1 = require("./design-system");
function homeKeyboard(isAdmin = false) {
    const rows = [
        [{ text: "🛒 خرید سرویس", action: "shop", tone: "primary" }, { text: "👛 کیف پول", action: "wallet", tone: "primary" }],
        [{ text: "📦 سفارش‌های من", action: "account" }, { text: "🎫 پشتیبانی", action: "support" }],
        [{ text: "🆓 اکانت تست", action: "freeAccount" }, { text: "🎁 دعوت دوستان", action: "referral" }],
    ];
    if (isAdmin) {
        rows.push([{ text: "⚙️ داشبورد ادمین", action: "admin:dashboard", tone: "primary" }]);
    }
    return (0, design_system_1.buildInlineKeyboard)(rows);
}
function navigationKeyboard(backTo = "home") {
    return telegraf_1.Markup.inlineKeyboard([
        [telegraf_1.Markup.button.callback("⬅️ بازگشت", backTo), telegraf_1.Markup.button.callback("🏠 منوی اصلی", "home")],
        [telegraf_1.Markup.button.callback("❌ لغو عملیات", "cancel")],
    ]);
}
