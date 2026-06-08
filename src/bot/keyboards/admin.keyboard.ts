import { Markup } from "telegraf";

export function adminKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("👥 کاربران", "admin:users"), Markup.button.callback("📂 دسته‌بندی‌ها", "admin:categories")],
    [Markup.button.callback("📦 مدیریت محصولات", "admin:products"), Markup.button.callback("🗄 موجودی اکانت‌ها", "admin:accounts")],
    [Markup.button.callback("💳 مدیریت کیف پول‌ها", "admin:wallets"), Markup.button.callback("🎟 کوپن‌ها", "admin:coupons")],
    [Markup.button.callback("💳 واریزی‌ها", "admin:deposits"), Markup.button.callback("⚡ درگاه پرداخت", "nav:admin.paymentGateway")],
    [Markup.button.callback("🧾 فاکتورهای پرداخت", "nav:admin.invoices"), Markup.button.callback("🎧 تیکت‌ها", "admin:tickets")],
    [Markup.button.callback("➕ محصول جدید", "admin:product:create"), Markup.button.callback("🧾 سفارش‌ها", "admin:orders")],
    [Markup.button.callback("🏠 خانه", "home")],
  ]);
}
