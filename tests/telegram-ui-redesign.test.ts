import { describe, expect, test } from "vitest";
import { callbackFor } from "../src/bot/navigation/panel-ui";
import { userHomeKeyboard } from "../src/bot/keyboards/user-menu.keyboard";
import { productDetailKeyboard } from "../src/bot/keyboards/product.keyboard";
import { purchasePaymentMethodKeyboard } from "../src/bot/keyboards/purchase.keyboard";
import { accountActionKeyboard } from "../src/bot/keyboards/account.keyboard";
import { adminDashboardKeyboard } from "../src/bot/keyboards/admin-dashboard.keyboard";
import { adminDangerConfirmKeyboard } from "../src/bot/keyboards/admin-danger.keyboard";
import { userHomeMessage } from "../src/bot/messages/user.messages";
import { productDetailMessage } from "../src/bot/messages/product.messages";
import { adminDangerConfirmMessage } from "../src/bot/messages/admin.messages";

const texts = (keyboard: { reply_markup: { inline_keyboard: Array<Array<{ text: string }>> } }) => keyboard.reply_markup.inline_keyboard.map((row) => row.map((button) => button.text));
const actions = (keyboard: { reply_markup: { inline_keyboard: Array<Array<{ callback_data?: string }>> } }) => keyboard.reply_markup.inline_keyboard.flatMap((row) => row.map((button) => button.callback_data));

describe("Telegram UI redesign keyboards", () => {
  test("home keyboard groups primary user actions", () => {
    expect(texts(userHomeKeyboard(false)).slice(0, 3)).toEqual([
      ["📦 خرید سرویس", "👤 اکانت‌های من"],
      ["💳 کیف پول", "🎟 کد تخفیف"],
      ["🆘 پشتیبانی", "📘 راهنما"],
    ]);
  });

  test("product detail keyboard has payment, coupon, back, and home actions", () => {
    const keyboard = productDetailKeyboard("p1");
    expect(texts(keyboard)).toEqual([
      ["💳 خرید با کیف پول"],
      ["🧾 پرداخت آنی"],
      ["🎟 وارد کردن کد تخفیف"],
      ["↩️ برگشت", "🏠 خانه"],
    ]);
    expect(actions(keyboard)).toContain(callbackFor("home"));
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
      ["🔗 لینک اشتراک", "📋 کانفیگ‌ها"],
      ["🔄 بروزرسانی وضعیت", "♻️ تمدید"],
      ["🆘 پشتیبانی", "🏠 خانه"],
    ]);
  });

  test("admin dashboard keyboard uses grouped operational sections", () => {
    expect(texts(adminDashboardKeyboard())).toEqual([
      ["📦 محصولات", "📥 موجودی اکانت‌ها"],
      ["🧩 Xray Center", "💳 پرداخت‌ها"],
      ["👥 کاربران", "🎟 کدهای تخفیف"],
      ["🆘 تیکت‌ها", "⚙️ تنظیمات"],
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
