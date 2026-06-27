import { callbackFor, type PanelViewId } from "../navigation/panel-ui";
import { buildInlineKeyboard, labels, type ButtonTone } from "./design-system";

type HomeButton = { text: string; action: string; tone?: ButtonTone };

export function homeKeyboard(isAdmin = false) {
  const rows: HomeButton[][] = [
    [
      { text: "🛒 خرید سرویس", action: callbackFor("shop"), tone: "success" as const },
      { text: "🎁 دریافت تست", action: callbackFor("freeAccount"), tone: "success" as const },
    ],
    [
      { text: labels.orders, action: callbackFor("services"), tone: "primary" as const },
      { text: "💳 کیف پول", action: callbackFor("wallet"), tone: "primary" as const },
    ],
    [
      { text: "🔮 پیش‌بینی", action: callbackFor("prediction"), tone: "primary" as const },
      { text: "🎁 دعوت دوستان", action: callbackFor("referral"), tone: "primary" as const },
    ],
    [
      { text: "🆘 پشتیبانی", action: callbackFor("support"), tone: "primary" as const },
      { text: "📢 اطلاعیه‌ها", action: callbackFor("referral"), tone: "primary" as const },
    ],
    [{ text: "📘 راهنما", action: callbackFor("productGuide"), tone: "neutral" as const }],
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
