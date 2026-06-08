"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminKeyboard = adminKeyboard;
const telegraf_1 = require("telegraf");
function adminKeyboard() {
    return telegraf_1.Markup.inlineKeyboard([
        [telegraf_1.Markup.button.callback("👥 کاربران", "admin:users"), telegraf_1.Markup.button.callback("📂 دسته‌بندی‌ها", "admin:categories")],
        [telegraf_1.Markup.button.callback("📦 مدیریت محصولات", "admin:products"), telegraf_1.Markup.button.callback("🗄 موجودی اکانت‌ها", "admin:accounts")],
        [telegraf_1.Markup.button.callback("💳 مدیریت کیف پول‌ها", "admin:wallets"), telegraf_1.Markup.button.callback("🎟 کوپن‌ها", "admin:coupons")],
        [telegraf_1.Markup.button.callback("💳 واریزی‌ها", "admin:deposits"), telegraf_1.Markup.button.callback("⚡ درگاه پرداخت", "nav:admin.paymentGateway")],
        [telegraf_1.Markup.button.callback("🧾 فاکتورهای پرداخت", "nav:admin.invoices"), telegraf_1.Markup.button.callback("🎧 تیکت‌ها", "admin:tickets")],
        [telegraf_1.Markup.button.callback("➕ محصول جدید", "admin:product:create"), telegraf_1.Markup.button.callback("🧾 سفارش‌ها", "admin:orders")],
        [telegraf_1.Markup.button.callback("🏠 خانه", "home")],
    ]);
}
