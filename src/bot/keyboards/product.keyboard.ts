import { actionFor, callbackFor } from "../navigation/panel-ui";
import { buildInlineKeyboard } from "./design-system";
import { actionLabels } from "../ui/labels";

export function productCardKeyboard(productId: string) {
  return buildInlineKeyboard([[{ text: actionLabels.details, action: callbackFor("shop.product", { productId }) }, { text: actionLabels.buy, action: callbackFor("shop.checkout", { productId }), tone: "success" }]]);
}

export function productDetailKeyboard(productId: string, backAction = callbackFor("shop.categories")) {
  return buildInlineKeyboard([
    [{ text: actionLabels.walletPurchase, action: actionFor("buy:wallet", productId), tone: "success" }],
    [{ text: actionLabels.instantPayment, action: actionFor("buy:invoice", productId), tone: "primary" }],
    [{ text: actionLabels.enterCoupon, action: actionFor("coupon:apply", productId) }],
    [{ text: actionLabels.back, action: backAction }, { text: actionLabels.home, action: callbackFor("home") }],
  ]);
}
