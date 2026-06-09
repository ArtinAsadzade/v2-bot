import { buildInlineKeyboard } from "./design-system";

export function adminKeyboard() {
  return buildInlineKeyboard([
    [{ text: "📊 آمار", action: "nav:admin.analytics", tone: "primary" }, { text: "💳 پرداخت‌ها", action: "nav:admin.paymentGateway" }],
    [{ text: "📦 محصولات", action: "admin:products" }, { text: "📁 دسته‌بندی‌ها", action: "admin:categories" }],
    [{ text: "👥 کاربران", action: "admin:users" }, { text: "🎟 تخفیف‌ها", action: "admin:coupons" }],
    [{ text: "🗄 موجودی اکانت‌ها", action: "admin:accounts" }, { text: "💳 واریزی‌ها", action: "admin:deposits" }],
    [{ text: "🧾 فاکتورهای پرداخت", action: "nav:admin.invoices" }, { text: "🎫 پشتیبانی", action: "admin:tickets" }],
    [{ text: "➕ محصول جدید", action: "admin:product:create", tone: "primary" }, { text: "📦 سفارش‌ها", action: "admin:orders" }],
    [{ text: "🏠 منوی اصلی", action: "home" }],
  ]);
}
