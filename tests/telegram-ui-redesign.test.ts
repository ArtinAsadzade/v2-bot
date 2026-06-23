import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { callbackFor } from "../src/bot/navigation/panel-ui";
import { buildInlineKeyboard } from "../src/bot/keyboards/design-system";
import { homeKeyboard } from "../src/bot/keyboards/common.keyboard";
import { productDetailViewKeyboard, checkoutViewKeyboard, adminDashboardViewKeyboard } from "../src/bot/keyboards/view-keyboards";
import { purchasePaymentMethodKeyboard } from "../src/bot/keyboards/purchase.keyboard";
import { accountActionKeyboard } from "../src/bot/keyboards/account.keyboard";
import { adminDangerConfirmKeyboard } from "../src/bot/keyboards/admin-danger.keyboard";
import { userHomeMessage } from "../src/bot/messages/user.messages";
import { productDetailMessage } from "../src/bot/messages/product.messages";
import { adminDangerConfirmMessage } from "../src/bot/messages/admin.messages";

const texts = (keyboard: { reply_markup: { inline_keyboard: Array<Array<{ text: string }>> } }) => keyboard.reply_markup.inline_keyboard.map((row) => row.map((button) => button.text));
const actions = (keyboard: { reply_markup: { inline_keyboard: Array<Array<{ callback_data?: string }>> } }) => keyboard.reply_markup.inline_keyboard.flatMap((row) => row.map((button) => button.callback_data));
const inlineFromView = (rows: Parameters<typeof buildInlineKeyboard>[0]) => buildInlineKeyboard(rows);
const accountViewsSource = readFileSync("src/bot/views/account.views.ts", "utf8");
const navigationHandlersSource = readFileSync("src/bot/handlers/modern/navigation.handlers.ts", "utf8");

describe("Telegram UI redesign keyboards", () => {
  test("home keyboard groups primary user actions", () => {
    const rows = texts(inlineFromView(homeKeyboard(false)));
    expect(rows).toEqual([
      ["🛒 خرید سرویس", "🎁 تست رایگان"],
      ["📦 سرویس‌های من", "👤 حساب کاربری"],
      ["🔮 پیش‌بینی", "🎁 دعوت دوستان"],
      ["🆘 پشتیبانی", "📘 راهنما"],
    ]);
    expect(rows.flat()).toContain("🎁 تست رایگان");
    expect(rows.flat()).toContain("🛒 خرید سرویس");
    expect(rows.flat()).toContain("🎁 دعوت دوستان");
    expect(rows.flat()).not.toContain("🎟 کد تخفیف");
  });

  test("account menu keeps wallet, transactions, and coupon below account", () => {
    const accountBlock = accountViewsSource.slice(accountViewsSource.indexOf('registerView("account"'), accountViewsSource.indexOf('registerView("account.details"'));
    expect(accountBlock).toContain('"💰 کیف پول"');
    expect(accountBlock).toContain('"🧾 تاریخچه خرید"');
    expect(accountBlock).toContain('"📦 سرویس‌های من"');
  });

  test("old callbacks route to new VPN-first screens", () => {
    expect(navigationHandlersSource).toContain('["accounts", { id: "account.details" }]');
    expect(navigationHandlersSource).toContain('["renew", { id: "account.renew" }]');
    expect(navigationHandlersSource).toContain('["account:renew", { id: "account.renew" }]');
  });

  test("product detail keyboard has payment, coupon, back, and home actions", () => {
    const keyboard = inlineFromView(productDetailViewKeyboard("p1", 10));
    expect(texts(keyboard)).toEqual([
      ["🛒 خرید"],
      ["🎟 وارد کردن کد تخفیف", "📋 جزئیات"],
      ["↩️ برگشت", "🏠 خانه"],
    ]);
    expect(actions(keyboard)).toContain(callbackFor("home"));
  });


  test("checkout keyboard keeps legacy buy and coupon callbacks plus cancel/home", () => {
    const keyboard = inlineFromView(checkoutViewKeyboard("p1", true, true));
    const callbackData = actions(keyboard);
    expect(callbackData).toContain("coupon:remove:p1");
    expect(callbackData).toContain("coupon:change:p1");
    expect(callbackData).toContain("buy:confirm:p1");
    expect(callbackData).toContain("buy:instant:p1");
    expect(callbackData).toContain("flow:cancel");
    expect(callbackData).toContain(callbackFor("home"));
  });

  test("purchase payment keyboard keeps legacy purchase callbacks compatible", () => {
    const callbackData = actions(purchasePaymentMethodKeyboard("p1"));
    expect(callbackData).toContain("buy:confirm:p1");
    expect(callbackData).toContain("buy:instant:p1");
    expect(callbackData).toContain("buy:cancel_existing:p1");
    expect(callbackData).toContain("flow:start:coupon_code:p1");
    expect(callbackData).toContain(callbackFor("home"));
  });

  test("account action keyboard exposes subscription, configs, refresh, renewal, support, and home", () => {
    expect(texts(accountActionKeyboard("x1"))).toEqual([
      ["🔗 لینک اشتراک", "📲 دریافت QR اشتراک"],
      ["📋 کانفیگ‌ها"],
      ["🔄 بروزرسانی وضعیت", "♻️ تمدید"],
      ["🆘 پشتیبانی", "🏠 خانه"],
    ]);
  });

  test("admin dashboard keyboard uses grouped operational sections", () => {
    expect(texts(inlineFromView(adminDashboardViewKeyboard()))).toEqual([
      ["📦 فروشگاه", "👥 کاربران"],
      ["🧩 Xray", "💳 مالی"],
      ["🔮 پیش‌بینی", "📣 اطلاع‌رسانی"],
      ["⚙️ تنظیمات", "📊 آمار"],
      ["🏠 خانه"],
    ]);
  });

  test("admin dangerous confirmation keyboard requires confirm or cancel", () => {
    const keyboard = adminDangerConfirmKeyboard("admin:product:delete:p1");
    expect(texts(keyboard)[0]).toEqual(["✅ تایید", "❌ لغو"]);
    expect(actions(keyboard)).toContain("admin:product:delete:p1");
    expect(actions(keyboard)).toContain(callbackFor("admin.dashboard"));
  });
});

describe("Telegram UI redesign messages", () => {
  test("new messages render without throwing", () => {
    expect(userHomeMessage({ firstName: "Ali", balance: "100,000 تومان", activeServices: 2 })).toContain("سلام Ali");
    expect(productDetailMessage({ title: "پلن", traffic: "100GB", duration: "30 روز", price: "200,000", finalAmount: "200,000" })).toContain("✅ مبلغ نهایی");
    expect(adminDangerConfirmMessage({ action: "حذف محصول", item: "پلن" })).toContain("⚠️ آیا مطمئن هستید؟");
  });
});


describe("Keyboard duplicate regression protection", () => {
  test("inline builder removes duplicate callback actions and empty rows", () => {
    const keyboard = buildInlineKeyboard([
      [{ text: "Back", action: callbackFor("home") }, { text: "Main Menu", action: callbackFor("home") }],
      [],
      [{ text: "Support", action: callbackFor("support") }],
      [{ text: "Support duplicate", action: callbackFor("support") }],
    ]);
    expect(actions(keyboard)).toEqual([callbackFor("home"), callbackFor("support")]);
    expect(texts(keyboard)).toEqual([["Back"], ["Support"]]);
  });
});
