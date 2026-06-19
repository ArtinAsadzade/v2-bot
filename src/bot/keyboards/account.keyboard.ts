import { callbackFor } from "../navigation/panel-ui";
import { xrayCallbacks } from "../callbacks";

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
