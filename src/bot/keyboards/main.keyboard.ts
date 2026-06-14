import { callbackFor, type PanelViewId } from "../navigation/panel-ui";
import { buildInlineKeyboard, labels, type ButtonTone } from "./design-system";

type HomeButton = { text: string; action: string; tone?: ButtonTone };

export function homeKeyboard(isAdmin = false) {
  const rows: HomeButton[][] = [
    [{ text: labels.shop, action: callbackFor("shop.categories"), tone: "primary" as const }, { text: labels.wallet, action: callbackFor("wallet"), tone: "primary" as const }],
    [{ text: labels.orders, action: callbackFor("account.details"), tone: "success" as const }, { text: labels.support, action: callbackFor("support") }],
    [{ text: "🆓 اکانت تست", action: callbackFor("freeAccount") }, { text: "🎁 دعوت دوستان", action: callbackFor("referral") }],
  ];

  if (isAdmin) {
    rows.push([{ text: labels.adminDashboard, action: callbackFor("admin.dashboard"), tone: "primary" as const }]);
  }

  return buildInlineKeyboard(rows);
}

export function navigationKeyboard(backTo: PanelViewId | string = "home") {
  return buildInlineKeyboard([
    [{ text: labels.back, action: backTo.startsWith("nav:") || backTo.includes(":") ? backTo : callbackFor(backTo as PanelViewId) }, { text: labels.home, action: callbackFor("home") }],
    [{ text: labels.cancel, action: "cancel", tone: "danger" }],
  ]);
}
