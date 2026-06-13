"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminKeyboard = adminKeyboard;
const design_system_1 = require("./design-system");
function adminKeyboard() {
    return (0, design_system_1.buildInlineKeyboard)([
        [
            { text: "📊 آمار", action: "nav:admin.analytics", tone: "primary" },
            { text: "💳 پرداخت‌ها", action: "nav:admin.paymentGateway" },
        ],
        [
            { text: "📦 محصولات", action: "admin:products" },
            { text: "📁 دسته‌بندی‌ها", action: "admin:categories" },
        ],
        [
            { text: "👥 کاربران", action: "admin:users" },
            { text: "🎟 تخفیف‌ها", action: "admin:coupons" },
        ],
        [
            { text: "🗄 موجودی اکانت‌ها", action: "admin:accounts" },
            { text: "💳 واریزی‌ها", action: "admin:deposits" },
        ],
        [
            { text: "🧾 فاکتورهای پرداخت", action: "nav:admin.invoices" },
            { text: "🎫 پشتیبانی", action: "admin:tickets" },
        ],
        [
            { text: "➕ محصول جدید", action: "admin:product:create", tone: "primary" },
            { text: "📦 سفارش‌ها", action: "admin:orders" },
        ],
        [{ text: "🏠 منوی اصلی", action: "home" }],
    ]);
}
