import { describe, expect, test } from "vitest";
import { buildInlineKeyboard, buildReplyKeyboard } from "../src/bot/keyboards/design-system";
import { callbackFor, ensureCallbackData, panelKeyboard } from "../src/bot/navigation/panel-ui";
import { homeKeyboard } from "../src/bot/keyboards/common.keyboard";
import { adminDashboardViewKeyboard, checkoutViewKeyboard, productDetailViewKeyboard } from "../src/bot/keyboards/view-keyboards";
import { buttonStyle } from "../src/bot/ui/button-style";

const first = <T>(rows: T[][]) => rows[0][0] as any;

describe("styled Telegram buttons", () => {
  test("design-system inline callback and URL buttons render styles while neutral omits style", () => {
    const keyboard = buildInlineKeyboard([
      [{ text: "خرید", action: callbackFor("shop.categories"), tone: "success" }],
      [{ text: "پشتیبانی", url: "https://example.com/support", tone: "primary" }],
      [{ text: "خانه", action: callbackFor("home"), tone: "neutral" }],
    ]).reply_markup.inline_keyboard;

    expect(keyboard[0][0]).toMatchObject({ callback_data: callbackFor("shop.categories"), style: "success" });
    expect(keyboard[1][0]).toMatchObject({ url: "https://example.com/support", style: "primary" });
    expect(keyboard[2][0]).not.toHaveProperty("style");
  });

  test("reply keyboard buttons support style and preserve plain text buttons", () => {
    const keyboard = buildReplyKeyboard([
      [{ text: "پرداخت", tone: "success" }, { text: "خانه", tone: "neutral" }],
      [{ text: "کیف پول", style: "primary" }],
      [{ text: "ارسال شماره", request_contact: true, tone: "primary" }],
    ]).reply_markup.keyboard;

    expect(keyboard[0][0]).toMatchObject({ text: "پرداخت", style: "success" });
    expect(keyboard[0][1]).toEqual({ text: "خانه" });
    expect(keyboard[1][0]).toMatchObject({ text: "کیف پول", style: "primary" });
    expect(keyboard[2][0]).toMatchObject({ text: "ارسال شماره", request_contact: true, style: "primary" });
  });

  test("panel keyboard renders styled callbacks and URLs and keeps callback data valid", () => {
    const keyboard = panelKeyboard(
      [
        [{ text: "پرداخت", action: "buy:confirm:p1", tone: "success" }],
        [{ text: "پشتیبانی", url: "https://example.com", tone: "primary" }],
      ],
      { back: false, home: false },
    ).reply_markup.inline_keyboard as Array<Array<{ callback_data?: string; style?: string; url?: string }>>;

    expect(keyboard[0][0]).toMatchObject({ callback_data: "buy:confirm:p1", style: "success" });
    expect(keyboard[1][0]).toMatchObject({ url: "https://example.com", style: "primary" });
    for (const button of keyboard.flat()) if (button.callback_data) expect(Buffer.byteLength(ensureCallbackData(button.callback_data))).toBeLessThanOrEqual(64);
  });

  test("intent mapping follows conversion, management, and danger UX rules", () => {
    expect(buttonStyle.intent.buy).toBe("success");
    expect(buttonStyle.intent.pay).toBe("success");
    expect(buttonStyle.intent.delete).toBe("danger");
    expect(buttonStyle.intent.disable).toBe("danger");
    expect(buttonStyle.intent.cancel).toBe("danger");
    expect(buttonStyle.intent.wallet).toBe("primary");
    expect(buttonStyle.intent.support).toBe("primary");
    expect(buttonStyle.intent.info).toBe("primary");
  });

  test("important user and admin panel buttons receive professional styles", () => {
    const home = buildInlineKeyboard(homeKeyboard(false)).reply_markup.inline_keyboard;
    expect(first(home)).toMatchObject({ text: "🛒 خرید سرویس", style: "success" });
    expect(home[1][1]).toMatchObject({ text: "💳 کیف پول", style: "primary" });
    expect(home[4][0]).toMatchObject({ text: "📘 راهنما" });
    expect(home[4][0]).toMatchObject({ style: "primary" });

    const detail = buildInlineKeyboard(productDetailViewKeyboard("p1", 1)).reply_markup.inline_keyboard;
    expect(first(detail)).toMatchObject({ text: "🛒 خرید", style: "success" });
    expect(detail[1][0]).toMatchObject({ style: "primary" });
    expect(detail[2][0]).not.toHaveProperty("style");

    const checkout = buildInlineKeyboard(checkoutViewKeyboard("p1", true, false)).reply_markup.inline_keyboard;
    expect(checkout[1].map((button) => button.style)).toEqual(["success", "success"]);
    expect(checkout[3][0]).toMatchObject({ style: "danger" });

    const admin = buildInlineKeyboard(adminDashboardViewKeyboard()).reply_markup.inline_keyboard;
    expect(admin[0][0]).toMatchObject({ text: "🛍 تجارت", style: "primary" });
    expect(admin[1][0]).toMatchObject({ text: "🧩 Xray", style: "primary" });
    expect(admin[4][0]).not.toHaveProperty("style");
  });
});
