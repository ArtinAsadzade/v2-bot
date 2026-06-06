import { Markup } from "telegraf";

export function homeKeyboard(isAdmin = false) {
  const rows = [
    [Markup.button.callback("🏪 فروشگاه", "shop")],
    [Markup.button.callback("💰 کیف پول", "wallet")],
    [Markup.button.callback("📦 اکانت‌های من", "account")],
    [Markup.button.callback("🆓 دریافت اکانت تست", "freeAccount")],
    [Markup.button.callback("🎁 دعوت دوستان", "referral")],
    [Markup.button.callback("🎫 پشتیبانی", "support")],
    [Markup.button.callback("⚙️ حساب کاربری", "account")],
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
