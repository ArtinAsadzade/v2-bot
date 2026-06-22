import { callbackFor, type PanelViewId } from "../navigation/panel-ui";
import { buildInlineKeyboard, labels, type ButtonTone } from "./design-system";

type HomeButton = { text: string; action: string; tone?: ButtonTone };

export function homeKeyboard(isAdmin = false) {
  const rows: HomeButton[][] = [
    [
      { text: "📦 خرید سرویس", action: callbackFor("shop.categories"), tone: "primary" as const },
      { text: "🎁 دریافت تست رایگان", action: callbackFor("freeAccount"), tone: "primary" as const },
    ],
    [
      { text: "🧩 سرویس‌های من", action: callbackFor("account.details"), tone: "success" as const },
      { text: "♻️ تمدید سرویس", action: callbackFor("account.renew"), tone: "success" as const },
    ],
    [
      { text: "👤 حساب من", action: callbackFor("account") },
      { text: "💳 کیف پول", action: callbackFor("wallet") },
    ],
    [
      { text: "🆘 پشتیبانی", action: callbackFor("support") },
      { text: "🎁 دعوت دوستان", action: callbackFor("referral") },
    ],
    [{ text: "📘 راهنما", action: callbackFor("productGuide") }],
  ];

  if (isAdmin) {
    rows.push([{ text: "🛠 پنل مدیریت", action: callbackFor("admin.dashboard"), tone: "primary" as const }]);
  }

  return buildInlineKeyboard(rows);
}

export function navigationKeyboard(backTo: PanelViewId | string = "home") {
  return buildInlineKeyboard([
    [
      { text: labels.back, action: backTo.startsWith("nav:") || backTo.includes(":") ? backTo : callbackFor(backTo as PanelViewId) },
      { text: labels.home, action: callbackFor("home") },
    ],
    [{ text: labels.cancel, action: "cancel", tone: "danger" }],
  ]);
}
