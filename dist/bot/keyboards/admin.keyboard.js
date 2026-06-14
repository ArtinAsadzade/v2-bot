"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminKeyboard = adminKeyboard;
const panel_ui_1 = require("../navigation/panel-ui");
const design_system_1 = require("./design-system");
function adminKeyboard() {
    return (0, design_system_1.buildInlineKeyboard)([
        [
            { text: "📊 آمار", action: (0, panel_ui_1.callbackFor)("admin.analytics"), tone: "primary" },
            { text: "💳 پرداخت‌ها", action: (0, panel_ui_1.callbackFor)("admin.paymentGateway") },
            { text: "🛡 مانیتورینگ سیستم", action: "admin:monitoring" },
        ],
        [
            { text: "📦 محصولات", action: (0, panel_ui_1.callbackFor)("admin.products") },
            { text: "📂 مدیریت دسته‌بندی‌ها", action: (0, panel_ui_1.callbackFor)("admin.categories") },
        ],
        [
            { text: "👥 کاربران", action: (0, panel_ui_1.callbackFor)("admin.users") },
            { text: "🎟 تخفیف‌ها", action: (0, panel_ui_1.callbackFor)("admin.coupons") },
        ],
        [
            { text: "🗄 موجودی اکانت‌ها", action: (0, panel_ui_1.callbackFor)("admin.accounts") },
            { text: "💳 واریزی‌ها", action: (0, panel_ui_1.callbackFor)("admin.deposits") },
        ],
        [
            { text: "🧾 فاکتورهای پرداخت", action: (0, panel_ui_1.callbackFor)("admin.invoices") },
            { text: "🎫 پشتیبانی", action: (0, panel_ui_1.callbackFor)("admin.tickets") },
        ],
        [
            { text: "➕ محصول جدید", action: "flow:start:product_create", tone: "primary" },
            { text: "📦 سفارش‌ها", action: (0, panel_ui_1.callbackFor)("admin.orders") },
        ],
        [{ text: "🏠 منوی اصلی", action: (0, panel_ui_1.callbackFor)("home") }],
    ]);
}
