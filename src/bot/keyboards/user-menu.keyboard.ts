import { callbackFor } from "../navigation/panel-ui";
import type { ButtonTone } from "./design-system";
import { buildInlineKeyboard } from "./design-system";
import { adminLabels, userLabels } from "../ui/labels";

export function userHomeKeyboard(isAdmin = false) {
  const rows: Array<Array<{ text: string; action: string; tone?: ButtonTone }>> = [
    [
      { text: userLabels.buyService, action: callbackFor("shop.categories"), tone: "primary" as const },
      { text: userLabels.myAccounts, action: callbackFor("account.details"), tone: "success" as const },
    ],
    [
      { text: userLabels.wallet, action: callbackFor("wallet"), tone: "primary" as const },
      { text: userLabels.coupon, action: callbackFor("shop.categories") },
    ],
    [
      { text: userLabels.support, action: callbackFor("support") },
      { text: userLabels.guide, action: callbackFor("productGuide") },
    ],
  ];
  if (isAdmin) rows.push([{ text: adminLabels.dashboard, action: callbackFor("admin.dashboard"), tone: "primary" as const }]);
  return buildInlineKeyboard(rows);
}
