import { callbackFor } from "../navigation/panel-ui";
import { buyCallbacks, couponCallbacks, nav, xrayCallbacks } from "../callbacks";
import { buildInlineKeyboard } from "./design-system";
import { actionLabels as uiActionLabels } from "../ui/labels";

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

export function purchasePaymentMethodKeyboard(productId: string) {
  return buildInlineKeyboard([
    [{ text: uiActionLabels.walletPurchase, action: buyCallbacks.confirm(productId), tone: "success" }],
    [{ text: uiActionLabels.instantPayment, action: buyCallbacks.instant(productId), tone: "primary" }],
    [{ text: uiActionLabels.enterCoupon, action: couponCallbacks.start(productId) }],
    [{ text: uiActionLabels.backToProduct, action: callbackFor("shop.product", { productId }) }, { text: uiActionLabels.cancelPurchase, action: buyCallbacks.cancelExisting(productId), tone: "danger" }],
    [{ text: uiActionLabels.home, action: callbackFor("home") }],
  ]);
}
