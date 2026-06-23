import { actionFor, callbackFor, type UiKeyboard } from "../navigation/panel-ui";
import { actionLabels, userLabels } from "../ui/labels";

export function productDetailViewKeyboard(productId: string, stock: number): UiKeyboard {
  return [
    ...(stock > 0 ? [[{ text: actionLabels.buy, action: callbackFor("shop.checkout", { productId }), tone: "success" as const }]] : []),
    [{ text: actionLabels.enterCoupon, action: actionFor("flow:start", "coupon_code", productId), tone: "primary" as const }],
    [
      { text: "↩️ برگشت", action: callbackFor("shop.categories"), tone: "warning" as const },
      { text: actionLabels.home, action: callbackFor("home"), tone: "warning" as const },
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
      { text: "🔙 بازگشت", action: callbackFor("shop.product", { productId }), tone: "warning" as const },
      { text: actionLabels.home, action: callbackFor("home"), tone: "warning" as const },
    ],
    [{ text: "لغو", action: "flow:cancel", tone: "danger" as const }],
  ];
}

export function accountListViewKeyboard(rows: UiKeyboard): UiKeyboard {
  return [
    ...rows,
    [
      { text: userLabels.buyService, action: callbackFor("shop.categories"), tone: "success" as const },
      { text: userLabels.support, action: callbackFor("support"), tone: "success" as const },
    ],
    [{ text: actionLabels.home, action: callbackFor("home"), tone: "info" as const }],
  ];
}

export function adminDashboardViewKeyboard(): UiKeyboard {
  return [
    [
      { text: "👥 کاربران", action: callbackFor("admin.usersSupport"), tone: "success" as const },
      { text: "🛍 فروشگاه", action: callbackFor("admin.store"), tone: "success" as const },
    ],
    [
      { text: "🧩 مرکز Xray", action: callbackFor("admin.xrayCenter"), tone: "primary" as const },
      { text: "💳 مالی", action: callbackFor("admin.finance"), tone: "primary" as const },
    ],
    [
      { text: "🔮 پیش‌بینی‌ها", action: callbackFor("admin.predictions"), tone: "primary" as const },
      { text: "🎫 پشتیبانی", action: callbackFor("admin.tickets"), tone: "primary" as const },
    ],
    [
      { text: "📣 اطلاع‌رسانی", action: callbackFor("admin.content"), tone: "primary" as const },
    ],
    [
      { text: "⚙️ تنظیمات", action: callbackFor("admin.botSettings"), tone: "warning" as const },
      { text: "🏠 خانه", action: callbackFor("home"), tone: "warning" as const },
    ],
  ];
}
