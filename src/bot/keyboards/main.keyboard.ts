import { Markup } from "telegraf";

export function homeKeyboard(isAdmin = false) {
  const rows = [
    [Markup.button.callback("🛍 فروشگاه", "shop"), Markup.button.callback("💳 کیف پول", "wallet")],
    [Markup.button.callback("👤 حساب کاربری", "account"), Markup.button.callback("🎧 پشتیبانی", "support")],
    [Markup.button.callback("🆓 اکانت تست", "freeAccount"), Markup.button.callback("🎁 دعوت دوستان", "referral")],
  ];

  if (isAdmin) {
    rows.push([Markup.button.callback("⚙️ مرکز مدیریت", "admin:dashboard")]);
  }

  return Markup.inlineKeyboard(rows);
}

export function navigationKeyboard(backTo = "home") {
  return Markup.inlineKeyboard([
    [Markup.button.callback("⬅️ بازگشت", backTo), Markup.button.callback("🏠 منوی اصلی", "home")],
    [Markup.button.callback("❌ لغو عملیات", "cancel")],
  ]);
}
