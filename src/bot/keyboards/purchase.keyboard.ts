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
    [{ text: "✅ ادامه پرداخت / پرداخت مجدد", url: paymentLink ?? "" }],
    [{ text: "❌ لغو سفارش و خرید جدید", callback_data: buyCallbacks.cancelExisting(productId) }],
    [{ text: "🔙 بازگشت", callback_data: callbackFor("shop.checkout", { productId }) }],
  ],
});

export const processingPurchaseRecoveryKeyboard = (productId: string) => ({
  inline_keyboard: [
    [{ text: "❌ لغو سفارش گیرکرده", callback_data: buyCallbacks.cancelExisting(productId) }],
    [{ text: "🔙 بازگشت", callback_data: callbackFor("shop.checkout", { productId }) }],
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

export type PendingPurchaseKeyboardMode = "unpaid_invoice" | "paid_delivery_pending" | "failed_delivery" | "stale_unpaid" | "active_processing" | "stale_processing";

export function pendingPurchaseResolverKeyboard(productId: string, mode: PendingPurchaseKeyboardMode, paymentLink?: string | null) {
  if (mode === "unpaid_invoice")
    return buildInlineKeyboard([
      [{ text: "✅ ادامه پرداخت / پرداخت مجدد", ...(paymentLink ? { url: paymentLink } : { action: buyCallbacks.pendingContinuePayment(productId) }), tone: "success" }, { text: "📋 جزئیات سفارش", action: buyCallbacks.pendingView(productId), tone: "primary" }],
      [{ text: "❌ لغو سفارش و خرید جدید", action: buyCallbacks.pendingCancel(productId), tone: "danger" }, { text: "🎫 پشتیبانی", action: buyCallbacks.pendingSupport(productId), tone: "primary" }],
    ]);
  if (mode === "paid_delivery_pending" || mode === "failed_delivery" || mode === "stale_processing")
    return buildInlineKeyboard([
      [{ text: "🔄 تلاش مجدد برای تحویل", action: buyCallbacks.pendingRetryDelivery(productId), tone: "success" }, { text: "📋 جزئیات سفارش", action: buyCallbacks.pendingView(productId), tone: "primary" }],
      [{ text: "🎫 ارسال به پشتیبانی", action: buyCallbacks.pendingSupport(productId), tone: "primary" }, { text: "🏠 خانه", action: nav.home(), tone: "neutral" }],
    ]);
  if (mode === "stale_unpaid")
    return buildInlineKeyboard([
      [{ text: "🛒 شروع خرید جدید", action: buyCallbacks.pendingStartNew(productId), tone: "success" }, { text: "🧹 بستن سفارش قبلی", action: buyCallbacks.pendingCancel(productId), tone: "danger" }],
      [{ text: "📋 جزئیات سفارش", action: buyCallbacks.pendingView(productId), tone: "primary" }, { text: "🏠 خانه", action: nav.home(), tone: "neutral" }],
    ]);
  return buildInlineKeyboard([
    [{ text: "📋 مشاهده وضعیت", action: buyCallbacks.pendingView(productId), tone: "primary" }, { text: "🎫 پشتیبانی", action: buyCallbacks.pendingSupport(productId), tone: "primary" }],
    [{ text: "🏠 خانه", action: nav.home(), tone: "neutral" }],
  ]);
}
