import { actionFor, callbackFor, type UiKeyboard } from "../navigation/panel-ui";
import { actionLabels, adminLabels, userLabels } from "../ui/labels";

export function productDetailViewKeyboard(productId: string, stock: number): UiKeyboard {
  return [
    ...(stock > 0 ? [[{ text: actionLabels.buy, action: callbackFor("shop.checkout", { productId }) }]] : []),
    [{ text: actionLabels.enterCoupon, action: actionFor("flow:start", "coupon_code", productId) }],
    [{ text: "↩️ برگشت", action: callbackFor("shop.products") }, { text: actionLabels.home, action: callbackFor("home") }],
  ];
}

export function checkoutViewKeyboard(productId: string, gatewayEnabled: boolean, hasCoupon: boolean): UiKeyboard {
  return [
    hasCoupon
      ? [
          { text: actionLabels.removeCoupon, action: actionFor("coupon:remove", productId) },
          { text: actionLabels.enterCoupon, action: actionFor("coupon:change", productId) },
        ]
      : [{ text: actionLabels.enterCoupon, action: actionFor("flow:start", "coupon_code", productId) }],
    [
      { text: actionLabels.walletPurchase, action: actionFor("buy:confirm", productId) },
      ...(gatewayEnabled ? [{ text: actionLabels.instantPayment, action: actionFor("buy:instant", productId) }] : []),
    ],
    [
      { text: "🔙 بازگشت", action: callbackFor("shop.product", { productId }) },
      { text: actionLabels.cancelPurchase, action: "flow:cancel" },
    ],
    [{ text: actionLabels.home, action: callbackFor("home") }],
  ];
}

export function accountListViewKeyboard(rows: UiKeyboard): UiKeyboard {
  return [
    ...rows,
    [
      { text: userLabels.buyService, action: callbackFor("shop.categories") },
      { text: userLabels.support, action: callbackFor("support") },
    ],
    [{ text: actionLabels.home, action: callbackFor("home") }],
  ];
}

export function adminDashboardViewKeyboard(): UiKeyboard {
  return [
    [
      { text: "👥 کاربران", action: callbackFor("admin.usersSupport") },
      { text: "🛍 فروشگاه", action: callbackFor("admin.store") },
    ],
    [
      { text: "🧩 مرکز Xray", action: callbackFor("admin.xrayCenter") },
      { text: "💳 مالی", action: callbackFor("admin.finance") },
    ],
    [
      { text: "🎫 پشتیبانی", action: callbackFor("admin.tickets") },
      { text: "📣 اطلاع‌رسانی", action: callbackFor("admin.content") },
    ],
    [
      { text: "⚙️ تنظیمات", action: callbackFor("admin.botSettings") },
      { text: "🏠 خانه", action: callbackFor("home") },
    ],
  ];
}
