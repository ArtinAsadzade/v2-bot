"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminKeyboard = adminKeyboard;
const telegraf_1 = require("telegraf");
function adminKeyboard() {
    return telegraf_1.Markup.inlineKeyboard([
        [telegraf_1.Markup.button.callback("👥 کاربران", "admin:users"), telegraf_1.Markup.button.callback("📦 محصولات", "admin:products")],
        [telegraf_1.Markup.button.callback("➕ محصول", "admin:product:create"), telegraf_1.Markup.button.callback("🔐 افزودن اکانت", "admin:accounts")],
        [telegraf_1.Markup.button.callback("💳 واریزی‌ها", "admin:deposits"), telegraf_1.Markup.button.callback("🎟 کوپن‌ها", "admin:coupons")],
        [telegraf_1.Markup.button.callback("🎧 تیکت‌ها", "admin:tickets"), telegraf_1.Markup.button.callback("🧾 سفارش‌ها", "admin:orders")],
        [telegraf_1.Markup.button.callback("🏠 خانه", "home")],
    ]);
}
