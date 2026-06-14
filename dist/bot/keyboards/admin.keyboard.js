"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminKeyboard = adminKeyboard;
const design_system_1 = require("./design-system");
function adminKeyboard() {
    return (0, design_system_1.buildInlineKeyboard)([
        [
            { text: "📊 آمار", action: "nav:admin.analytics", tone: "primary" },
            { text: "💳 پرداخت‌ها", action: "nav:admin.paymentGateway" },
            { text: "🛡 مانیتورینگ سیستم", action: "admin:monitoring" },
        ],
        [
            { text: "📦 محصولات", action: "nav:admin.products" },
            { text: "📂 مدیریت دسته‌بندی‌ها", action: "nav:admin.categories" },
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
            { text: "➕ محصول جدید", action: "flow:start:product_create", tone: "primary" },
            { text: "📦 سفارش‌ها", action: "admin:orders" },
        ],
        [{ text: "🏠 منوی اصلی", action: "home" }],
    ]);
}
