import { describe, expect, test } from "vitest";
import { callbackFor } from "../src/bot/navigation/panel-ui";
import { adminKeyboard } from "../src/bot/keyboards/admin.keyboard";
import { adminDangerConfirmKeyboard } from "../src/bot/keyboards/admin-danger.keyboard";
import { homeKeyboard, supportCloseHomeInlineKeyboard } from "../src/bot/keyboards/common.keyboard";
import {
  AdminKeyboard,
  AdminPaymentsKeyboard,
  AdminProductsKeyboard,
  AdminSettingsKeyboard,
  AdminUsersKeyboard,
  InvoiceActionKeyboard,
  MainMenuKeyboard,
  PaymentKeyboard,
  PurchaseKeyboard,
  SettingsKeyboard,
  ShopKeyboard,
  SupportKeyboard,
  UserKeyboard,
  WalletActionKeyboard,
  WalletKeyboard,
  buildInlineKeyboard,
  buildReplyKeyboard,
  paymentFailureKeyboard,
  paymentSuccessKeyboard,
} from "../src/bot/keyboards/design-system";
import { navigationKeyboard } from "../src/bot/keyboards/main.keyboard";
import {
  accountActionKeyboard,
  accountActionViewKeyboard,
  xrayConfigsSentKeyboard,
  xrayRenewalInvoiceKeyboard,
  xrayRenewedKeyboard,
  xraySubscriptionKeyboard,
} from "../src/bot/keyboards/account.keyboard";
import {
  accountHomeInlineKeyboard,
  expiredCheckoutRecoveryKeyboard,
  pendingInvoiceRecoveryKeyboard,
  processingPurchaseRecoveryKeyboard,
  purchasePaymentMethodKeyboard,
  standardPurchaseDeliveryKeyboard,
  xrayPurchaseDeliveryKeyboard,
} from "../src/bot/keyboards/purchase.keyboard";
import { accountListViewKeyboard, adminDashboardViewKeyboard, checkoutViewKeyboard, productDetailViewKeyboard } from "../src/bot/keyboards/view-keyboards";
import { adminDashboardMessage, adminDangerConfirmMessage } from "../src/bot/messages/admin.messages";
import { errorUxMessages } from "../src/bot/messages/error.messages";
import { productCardMessage, productDetailMessage } from "../src/bot/messages/product.messages";
import { purchaseStepMessage, purchaseUxMessages } from "../src/bot/messages/purchase.messages";
import { userHomeMessage } from "../src/bot/messages/user.messages";
import { walletTopupMessage } from "../src/bot/messages/wallet.messages";
import { xrayCenterMessage } from "../src/bot/messages/xray.messages";

const callbackData = (keyboard: { reply_markup: { inline_keyboard: Array<Array<{ callback_data?: string; url?: string }>> } }) =>
  keyboard.reply_markup.inline_keyboard.flatMap((row) => row.map((button) => button.callback_data ?? button.url ?? ""));
const viewCallbacks = (rows: Array<Array<{ action: string }>>) => rows.flatMap((row) => row.map((button) => button.action));

describe("UI dead-code cleanup coverage", () => {
  test("all exported keyboard builders render without throwing", () => {
    const inlineKeyboards = [
      adminKeyboard(),
      adminDangerConfirmKeyboard("admin:product:delete:p1"),
      buildInlineKeyboard([[{ text: "ok", action: callbackFor("home") }]]),
      InvoiceActionKeyboard("https://example.com/pay", callbackFor("wallet")),
      WalletActionKeyboard(),
      paymentSuccessKeyboard("product"),
      paymentFailureKeyboard(),
      navigationKeyboard(),
      accountActionKeyboard("x1"),
      purchasePaymentMethodKeyboard("p1"),
    ];
    for (const keyboard of inlineKeyboards) expect(keyboard.reply_markup.inline_keyboard.length).toBeGreaterThan(0);

    const replyKeyboards = [
      buildReplyKeyboard([[{ text: "ok" }]]),
      MainMenuKeyboard(),
      UserKeyboard(),
      WalletKeyboard(),
      ShopKeyboard(),
      PurchaseKeyboard(),
      SupportKeyboard(),
      AdminKeyboard(),
      AdminProductsKeyboard(),
      AdminPaymentsKeyboard(),
      AdminUsersKeyboard(),
      AdminSettingsKeyboard(),
      PaymentKeyboard(),
      SettingsKeyboard(),
    ];
    for (const keyboard of replyKeyboards) expect(keyboard.reply_markup.keyboard.length).toBeGreaterThan(0);
  });

  test("major view keyboards keep back/home/cancel coverage and callback compatibility", () => {
    expect(viewCallbacks(homeKeyboard(true))).toEqual(expect.arrayContaining([callbackFor("shop.categories"), callbackFor("account"), callbackFor("support"), callbackFor("productGuide"), callbackFor("admin.dashboard")]));
    expect(viewCallbacks(productDetailViewKeyboard("p1", 1))).toEqual(expect.arrayContaining([callbackFor("shop.checkout", { productId: "p1" }), callbackFor("home")]));
    expect(viewCallbacks(checkoutViewKeyboard("p1", true, false))).toEqual(expect.arrayContaining(["buy:confirm:p1", "buy:instant:p1", "flow:cancel", callbackFor("home")]));
    expect(viewCallbacks(accountActionViewKeyboard("x1", { renewable: true }))).toEqual(expect.arrayContaining(["xray:sub:x1", "xray:qr:x1", "xray:configs:x1", callbackFor("account.renew", { xrayClientId: "x1" }), callbackFor("home")]));
    expect(viewCallbacks(adminDashboardViewKeyboard())).toEqual(expect.arrayContaining([callbackFor("admin.analytics"), callbackFor("admin.store"), callbackFor("admin.finance"), callbackFor("admin.xrayCenter"), callbackFor("home")]));
    expect(viewCallbacks(accountListViewKeyboard([[{ text: "svc", action: callbackFor("account.xray", { xrayClientId: "x1" }) }]]))).toContain(callbackFor("home"));
  });

  test("purchase and xray delivery keyboards preserve old callback data", () => {
    expect(callbackData({ reply_markup: xraySubscriptionKeyboard("x1") })).toEqual(expect.arrayContaining(["xray:qr:x1", "xray:configs:x1"]));
    expect(callbackData({ reply_markup: xrayConfigsSentKeyboard("x1") })).toContain("xray:sub:x1");
    expect(callbackData({ reply_markup: xrayRenewedKeyboard("x1") })).toContain(callbackFor("account.xray", { xrayClientId: "x1" }));
    expect(callbackData({ reply_markup: xrayRenewalInvoiceKeyboard("x1", "https://example.com/pay") })).toEqual(expect.arrayContaining(["https://example.com/pay", callbackFor("account.xray", { xrayClientId: "x1" })]));
    expect(callbackData({ reply_markup: accountHomeInlineKeyboard() })).toEqual(expect.arrayContaining([callbackFor("account.details"), callbackFor("home")]));
    expect(callbackData({ reply_markup: xrayPurchaseDeliveryKeyboard("x1") })).toEqual(expect.arrayContaining(["xray:sub:x1", "xray:configs:x1", callbackFor("home")]));
    expect(callbackData({ reply_markup: standardPurchaseDeliveryKeyboard() })).toEqual(expect.arrayContaining([callbackFor("account.details"), callbackFor("shop.categories"), callbackFor("home")]));
    expect(callbackData({ reply_markup: expiredCheckoutRecoveryKeyboard() })).toEqual(expect.arrayContaining([callbackFor("shop.categories"), callbackFor("home")]));
    expect(callbackData({ reply_markup: pendingInvoiceRecoveryKeyboard("p1", "https://example.com/pay") })).toEqual(expect.arrayContaining(["buy:cancel_existing:p1", callbackFor("shop.checkout", { productId: "p1" })]));
    expect(callbackData({ reply_markup: processingPurchaseRecoveryKeyboard("p1") })).toEqual(expect.arrayContaining(["buy:cancel_existing:p1", callbackFor("shop.checkout", { productId: "p1" })]));
  });

  test("exported UI message builders used in flows render without throwing", () => {
    const messages = [
      adminDashboardMessage({ todayRevenue: "100 تومان", todayOrders: 1, pendingPayments: 2, activeUsers: 3, xrayHealth: "OK", openTickets: 4 }),
      adminDangerConfirmMessage({ action: "حذف", item: "آیتم" }),
      productCardMessage({ title: "پلن", traffic: "10GB", duration: "30 روز", price: "100", available: true }),
      productDetailMessage({ title: "پلن", traffic: "10GB", duration: "30 روز", price: "100", finalAmount: "100" }),
      purchaseStepMessage(1, "پلن"),
      userHomeMessage({ balance: "100", activeServices: 1 }),
      walletTopupMessage({ balance: "100", minimumTopup: "10" }),
      xrayCenterMessage({ apiHealthy: true, inboundCount: 1, missingClients: 0, brokenSubscriptions: 0 }),
      errorUxMessages.xrayApiDownUser,
      purchaseUxMessages.serviceReady,
    ];
    for (const message of messages) expect(message.length).toBeGreaterThan(0);
  });
});
