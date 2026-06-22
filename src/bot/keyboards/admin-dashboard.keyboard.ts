import { callbackFor } from "../navigation/panel-ui";
import { buildInlineKeyboard } from "./design-system";
import { adminLabels } from "../ui/labels";

export function adminDashboardKeyboard() {
  return buildInlineKeyboard([
    [{ text: adminLabels.products, action: callbackFor("admin.products"), tone: "primary" }, { text: adminLabels.inventory, action: callbackFor("admin.accounts") }],
    [{ text: adminLabels.xrayCenter, action: callbackFor("admin.xraySettings"), tone: "primary" }, { text: adminLabels.payments, action: callbackFor("admin.finance") }],
    [{ text: adminLabels.users, action: callbackFor("admin.users") }, { text: adminLabels.coupons, action: callbackFor("admin.coupons") }],
    [{ text: adminLabels.tickets, action: callbackFor("admin.tickets") }, { text: adminLabels.settings, action: callbackFor("admin.botSettings") }],
  ]);
}
