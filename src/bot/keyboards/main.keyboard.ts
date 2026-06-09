import { buildInlineKeyboard, labels, type ButtonTone } from "./design-system";

type HomeButton = { text: string; action: string; tone?: ButtonTone };

export function homeKeyboard(isAdmin = false) {
  const rows: HomeButton[][] = [
    [{ text: labels.shop, action: "shop", tone: "primary" as const }, { text: labels.wallet, action: "wallet", tone: "primary" as const }],
    [{ text: labels.orders, action: "account", tone: "success" as const }, { text: labels.support, action: "support" }],
    [{ text: "🆓 اکانت تست", action: "freeAccount" }, { text: "🎁 دعوت دوستان", action: "referral" }],
  ];

  if (isAdmin) {
    rows.push([{ text: labels.adminDashboard, action: "admin:dashboard", tone: "primary" as const }]);
  }

  return buildInlineKeyboard(rows);
}

export function navigationKeyboard(backTo = "home") {
  return buildInlineKeyboard([
    [{ text: labels.back, action: backTo }, { text: labels.home, action: "home" }],
    [{ text: labels.cancel, action: "cancel", tone: "danger" }],
  ]);
}
