import { Markup } from "telegraf";

export function adminKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("👥 کاربران", "admin:users"), Markup.button.callback("📦 محصولات", "admin:products")],
    [Markup.button.callback("➕ محصول", "admin:product:create"), Markup.button.callback("🔐 افزودن اکانت", "admin:accounts")],
    [Markup.button.callback("💳 واریزی‌ها", "admin:deposits"), Markup.button.callback("🎟 کوپن‌ها", "admin:coupons")],
    [Markup.button.callback("🎧 تیکت‌ها", "admin:tickets"), Markup.button.callback("🧾 سفارش‌ها", "admin:orders")],
    [Markup.button.callback("🏠 خانه", "home")],
  ]);
}
