import { Markup } from "telegraf";

export function homeKeyboard(isAdmin = false) {
  const rows = [
    [Markup.button.callback("🛒 خرید سرویس", "shop")],
    [Markup.button.callback("💰 کیف پول", "wallet"), Markup.button.callback("➕ شارژ کیف پول", "deposit")],
    [Markup.button.callback("🎧 پشتیبانی", "support")],
    [Markup.button.callback("🎁 زیرمجموعه‌گیری", "referral"), Markup.button.callback("🆓 کانفیگ رایگان", "free_config")],
  ];

  if (isAdmin) {
    rows.push([Markup.button.callback("👨‍💼 پنل مدیریت", "admin:dashboard")]);
  }

  return Markup.inlineKeyboard(rows);
}

export function navigationKeyboard(backTo = "home") {
  return Markup.inlineKeyboard([
    [Markup.button.callback("⬅️ بازگشت", backTo), Markup.button.callback("🏠 خانه", "home")],
    [Markup.button.callback("❌ لغو", "cancel")],
  ]);
}
