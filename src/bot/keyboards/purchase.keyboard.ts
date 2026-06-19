import { callbackFor } from "../navigation/panel-ui";
import { buyCallbacks, nav, xrayCallbacks } from "../callbacks";

export const accountHomeInlineKeyboard = () => ({
  inline_keyboard: [[{ text: "📦 اکانت‌های من", callback_data: nav.accountDetails() }], [{ text: "🏠 خانه", callback_data: nav.home() }]],
});

export const xrayPurchaseDeliveryKeyboard = (clientId: string) => ({
  inline_keyboard: [
    [{ text: "📦 مشاهده سرویس", callback_data: callbackFor("account.xray", { xrayClientId: clientId }) }],
    [
      { text: "🔗 دریافت لینک اشتراک", callback_data: xrayCallbacks.subscription(clientId) },
      { text: "⚙️ دریافت کانفیگ‌ها", callback_data: xrayCallbacks.configs(clientId) },
    ],
    [{ text: "🏠 خانه", callback_data: nav.home() }],
  ],
});

export const standardPurchaseDeliveryKeyboard = () => ({
  inline_keyboard: [
    [
      { text: "📦 اکانت‌های من", callback_data: nav.accountDetails() },
      { text: "🛒 خرید مجدد", callback_data: nav.shopCategories() },
    ],
    [{ text: "🏠 خانه", callback_data: nav.home() }],
  ],
});

export const expiredCheckoutRecoveryKeyboard = () => ({
  inline_keyboard: [[{ text: "🛒 بازگشت به فروشگاه", callback_data: nav.shopCategories() }, { text: "🏠 خانه", callback_data: nav.home() }]],
});

export const pendingInvoiceRecoveryKeyboard = (productId: string, paymentLink?: string | null) => ({
  inline_keyboard: [
    [{ text: "Pay previous invoice", url: paymentLink ?? "" }],
    [{ text: "Cancel and create new invoice", callback_data: buyCallbacks.cancelExisting(productId) }],
    [{ text: "Back", callback_data: callbackFor("shop.checkout", { productId }) }],
  ],
});

export const processingPurchaseRecoveryKeyboard = (productId: string) => ({
  inline_keyboard: [
    [{ text: "Cancel stuck purchase", callback_data: buyCallbacks.cancelExisting(productId) }],
    [{ text: "Back", callback_data: callbackFor("shop.checkout", { productId }) }],
  ],
});
