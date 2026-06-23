import { actionFor, callbackFor, type UiKeyboard } from "../navigation/panel-ui";
import { actionLabels, userLabels } from "../ui/labels";

export function productDetailViewKeyboard(productId: string, stock: number): UiKeyboard {
  return [
    ...(stock > 0 ? [[{ text: actionLabels.buy, action: callbackFor("shop.checkout", { productId }), tone: "success" as const }]] : []),
    [{ text: actionLabels.enterCoupon, action: actionFor("flow:start", "coupon_code", productId), tone: "primary" as const }, { text: "📋 جزئیات", action: callbackFor("shop.product", { productId }), tone: "primary" as const }],
    [
      { text: "↩️ برگشت", action: callbackFor("shop.categories"), tone: "neutral" as const },
      { text: actionLabels.home, action: callbackFor("home"), tone: "neutral" as const },
    ],
  ];
}

export function checkoutViewKeyboard(productId: string, gatewayEnabled: boolean, hasCoupon: boolean): UiKeyboard {
  return [
    hasCoupon
      ? [
          { text: actionLabels.removeCoupon, action: actionFor("coupon:remove", productId), tone: "danger" as const },
          { text: actionLabels.enterCoupon, action: actionFor("coupon:change", productId), tone: "success" as const },
        ]
      : [{ text: actionLabels.enterCoupon, action: actionFor("flow:start", "coupon_code", productId), tone: "success" as const }],
    [
      { text: actionLabels.walletPurchase, action: actionFor("buy:confirm", productId), tone: "success" as const },
      ...(gatewayEnabled ? [{ text: actionLabels.instantPayment, action: actionFor("buy:instant", productId), tone: "success" as const }] : []),
    ],
    [
      { text: "🔙 بازگشت", action: callbackFor("shop.product", { productId }), tone: "neutral" as const },
      { text: actionLabels.home, action: callbackFor("home"), tone: "neutral" as const },
    ],
    [{ text: "لغو", action: "flow:cancel", tone: "danger" as const }],
  ];
}

export function accountListViewKeyboard(rows: UiKeyboard): UiKeyboard {
  return [
    ...rows,
    [
      { text: userLabels.buyService, action: callbackFor("shop.categories"), tone: "success" as const },
      { text: userLabels.support, action: callbackFor("support"), tone: "primary" as const },
    ],
    [{ text: actionLabels.home, action: callbackFor("home"), tone: "neutral" as const }],
  ];
}

export function adminDashboardViewKeyboard(): UiKeyboard {
  return [
    [{ text: "🛍 تجارت", action: callbackFor("admin.store"), tone: "primary" as const }, { text: "👥 مشتریان", action: callbackFor("admin.usersSupport"), tone: "primary" as const }],
    [{ text: "🧩 Xray", action: callbackFor("admin.xrayCenter"), tone: "primary" as const }, { text: "📣 بازاریابی", action: callbackFor("admin.content"), tone: "primary" as const }],
    [{ text: "⚙️ سیستم", action: callbackFor("admin.botSettings"), tone: "primary" as const }, { text: "💳 مالی", action: callbackFor("admin.finance"), tone: "primary" as const }],
    [{ text: "📊 داشبورد", action: callbackFor("admin.dashboard"), tone: "neutral" as const }, { text: "🏠 خانه", action: callbackFor("home"), tone: "neutral" as const }],
  ];
}
