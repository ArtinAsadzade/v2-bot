import { Markup } from "telegraf";
import { buildInlineKeyboard } from "./design-system";

export function homeKeyboard(isAdmin = false) {
  const rows = [
    [{ text: "🛒 خرید سرویس", action: "shop", tone: "primary" as const }, { text: "👛 کیف پول", action: "wallet", tone: "primary" as const }],
    [{ text: "📦 سفارش‌های من", action: "account" }, { text: "🎫 پشتیبانی", action: "support" }],
    [{ text: "🆓 اکانت تست", action: "freeAccount" }, { text: "🎁 دعوت دوستان", action: "referral" }],
  ];

  if (isAdmin) {
    rows.push([{ text: "⚙️ داشبورد ادمین", action: "admin:dashboard", tone: "primary" as const }]);
  }

  return buildInlineKeyboard(rows);
}

export function navigationKeyboard(backTo = "home") {
  return Markup.inlineKeyboard([
    [Markup.button.callback("⬅️ بازگشت", backTo), Markup.button.callback("🏠 منوی اصلی", "home")],
    [Markup.button.callback("❌ لغو عملیات", "cancel")],
  ]);
}
