import { callbackFor } from "../navigation/panel-ui";
import { xrayCallbacks } from "../callbacks";
import { buildInlineKeyboard as buildUiInlineKeyboard } from "./design-system";
import { actionLabels as accountActionLabels } from "../ui/labels";

export const xraySubscriptionKeyboard = (clientId: string) => ({
  inline_keyboard: [
    [
      { text: "📲 نمایش QR", callback_data: xrayCallbacks.qr(clientId) },
      { text: "⚙️ دریافت کانفیگ‌ها", callback_data: xrayCallbacks.configs(clientId) },
    ],
    [{ text: "🔙 بازگشت", callback_data: callbackFor("account.xray", { xrayClientId: clientId }) }],
  ],
});

export const xrayConfigsSentKeyboard = (clientId: string) => ({
  inline_keyboard: [[{ text: "🔗 لینک اشتراک", callback_data: xrayCallbacks.subscription(clientId) }, { text: "🔙 بازگشت", callback_data: callbackFor("account.xray", { xrayClientId: clientId }) }]],
});

export const xrayRenewedKeyboard = (xrayClientId: string) => ({
  inline_keyboard: [[{ text: "🧩 مشاهده سرویس", callback_data: callbackFor("account.xray", { xrayClientId }) }]],
});

export const xrayRenewalInvoiceKeyboard = (xrayClientId: string, paymentLink?: string | null) => ({
  inline_keyboard: [[{ text: "⚡ پرداخت", url: paymentLink ?? "" }], [{ text: "🔙 بازگشت", callback_data: callbackFor("account.xray", { xrayClientId }) }]],
});

export function accountActionKeyboard(xrayClientId: string) {
  return buildUiInlineKeyboard([
    [{ text: accountActionLabels.subscription, action: xrayCallbacks.subscription(xrayClientId) }, { text: accountActionLabels.configs, action: xrayCallbacks.configs(xrayClientId) }],
    [{ text: accountActionLabels.refresh, action: callbackFor("account.xray", { xrayClientId }) }, { text: accountActionLabels.renew, action: callbackFor("account.renew", { xrayClientId }) }],
    [{ text: accountActionLabels.support, action: callbackFor("support") }, { text: accountActionLabels.home, action: callbackFor("home") }],
  ]);
}
