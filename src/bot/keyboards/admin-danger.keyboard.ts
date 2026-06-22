import { callbackFor } from "../navigation/panel-ui";
import { buildInlineKeyboard } from "./design-system";
import { actionLabels, adminLabels } from "../ui/labels";

export function adminDangerConfirmKeyboard(confirmAction: string, cancelAction = callbackFor("admin.dashboard")) {
  return buildInlineKeyboard([
    [{ text: actionLabels.confirm, action: confirmAction, tone: "danger" }, { text: actionLabels.cancel, action: cancelAction }],
    [{ text: adminLabels.adminBack, action: callbackFor("admin.dashboard") }],
  ]);
}
