import { callbackFor } from "../navigation/panel-ui";
import { buildInlineKeyboard } from "./design-system";
import { actionLabels } from "../ui/labels";

export function walletTopupKeyboard() {
  return buildInlineKeyboard([
    [{ text: "💳 شارژ 100,000", action: "deposit:amount:100000", tone: "primary" }, { text: "💳 شارژ 200,000", action: "deposit:amount:200000", tone: "primary" }],
    [{ text: "💳 مبلغ دلخواه", action: callbackFor("deposit"), tone: "success" }],
    [{ text: "📜 تراکنش‌ها", action: callbackFor("wallet.history") }],
    [{ text: actionLabels.home, action: callbackFor("home") }],
  ]);
}
