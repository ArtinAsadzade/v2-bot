"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.homeKeyboard = homeKeyboard;
exports.navigationKeyboard = navigationKeyboard;
const telegraf_1 = require("telegraf");
function homeKeyboard(isAdmin = false) {
    const rows = [
        [telegraf_1.Markup.button.callback("🛍 فروشگاه", "shop"), telegraf_1.Markup.button.callback("💳 کیف پول", "wallet")],
        [telegraf_1.Markup.button.callback("👤 حساب کاربری", "account"), telegraf_1.Markup.button.callback("🎧 پشتیبانی", "support")],
        [telegraf_1.Markup.button.callback("🆓 اکانت تست", "freeAccount"), telegraf_1.Markup.button.callback("🎁 دعوت دوستان", "referral")],
    ];
    if (isAdmin) {
        rows.push([telegraf_1.Markup.button.callback("⚙️ مرکز مدیریت", "admin:dashboard")]);
    }
    return telegraf_1.Markup.inlineKeyboard(rows);
}
function navigationKeyboard(backTo = "home") {
    return telegraf_1.Markup.inlineKeyboard([
        [telegraf_1.Markup.button.callback("⬅️ بازگشت", backTo), telegraf_1.Markup.button.callback("🏠 منوی اصلی", "home")],
        [telegraf_1.Markup.button.callback("❌ لغو عملیات", "cancel")],
    ]);
}
