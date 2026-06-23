import { describe, expect, test } from "vitest";
import { AdminKeyboard, MainMenuKeyboard } from "../src/bot/keyboards/design-system";
import { buildInlineKeyboard } from "../src/bot/keyboards/design-system";
import { homeKeyboard } from "../src/bot/keyboards/common.keyboard";
import { adminDashboardViewKeyboard, checkoutViewKeyboard, productDetailViewKeyboard } from "../src/bot/keyboards/view-keyboards";
import { buttonIntent } from "../src/bot/ui/button-style";

const styles = (rows: any[][]) => rows.map((row) => row.map((button) => button.style ?? "default"));
const texts = (rows: any[][]) => rows.map((row) => row.map((button) => button.text));
const isBalanced = (rows: any[][]) => rows.slice(0, -1).every((row) => row.length === 2);

describe("premium Telegram design system refactor", () => {
  test("intent tokens enforce global color philosophy", () => {
    expect(buttonIntent.buy).toBe("success");
    expect(buttonIntent.pay).toBe("success");
    expect(buttonIntent.confirm).toBe("success");
    expect(buttonIntent.create).toBe("success");
    expect(buttonIntent.claimReward).toBe("success");
    expect(buttonIntent.support).toBe("primary");
    expect(buttonIntent.wallet).toBe("primary");
    expect(buttonIntent.xray).toBe("primary");
    expect(buttonIntent.delete).toBe("danger");
    expect(buttonIntent.disable).toBe("danger");
    expect(buttonIntent.back).toBe("neutral");
    expect(buttonIntent.home).toBe("neutral");
  });

  test("home reply keyboard mirrors requested architecture and styles", () => {
    const keyboard = MainMenuKeyboard().reply_markup.keyboard as any[][];
    expect(texts(keyboard)).toEqual([
      ["🛒 خرید سرویس", "🎁 دریافت تست رایگان"],
      ["🧩 سرویس‌های من", "💳 کیف پول"],
      ["🔮 پیش‌بینی", "🎁 دعوت دوستان"],
      ["🆘 پشتیبانی", "📢 اطلاعیه‌ها"],
      ["📘 راهنما"],
    ]);
    expect(styles(keyboard)).toEqual([
      ["success", "success"],
      ["primary", "primary"],
      ["primary", "primary"],
      ["primary", "primary"],
      ["default"],
    ]);
  });

  test("inline home layout remains balanced and uses matching hierarchy", () => {
    const keyboard = buildInlineKeyboard(homeKeyboard(false)).reply_markup.inline_keyboard as any[][];
    expect(isBalanced(keyboard)).toBe(true);
    expect(styles(keyboard)).toEqual([
      ["success", "success"],
      ["primary", "primary"],
      ["success", "success"],
      ["primary", "primary"],
      ["primary"],
    ]);
  });

  test("admin dashboard has balanced primary section hubs and default home", () => {
    const keyboard = buildInlineKeyboard(adminDashboardViewKeyboard()).reply_markup.inline_keyboard as any[][];
    expect(texts(keyboard)).toEqual([
      ["🛍 تجارت", "👥 مشتریان"],
      ["🧩 Xray", "📣 بازاریابی"],
      ["⚙️ سیستم", "💳 مالی"],
      ["📊 داشبورد", "🏠 خانه"],
    ]);
    expect(styles(keyboard).slice(0, 3).flat().every((style) => style === "primary")).toBe(true);
    expect(styles(keyboard)[3]).toEqual(["default", "default"]);
  });

  test("purchase and product keyboards separate main, management, navigation, and danger rows", () => {
    const detail = buildInlineKeyboard(productDetailViewKeyboard("p1", 1)).reply_markup.inline_keyboard as any[][];
    expect(styles(detail)[0]).toEqual(["success"]);
    expect(styles(detail)[1]).toEqual(["primary", "primary"]);
    expect(styles(detail)[2]).toEqual(["default", "default"]);

    const checkout = buildInlineKeyboard(checkoutViewKeyboard("p1", true, false)).reply_markup.inline_keyboard as any[][];
    expect(styles(checkout)[1]).toEqual(["success", "success"]);
    expect(styles(checkout)[2]).toEqual(["default", "default"]);
    expect(styles(checkout)[3]).toEqual(["danger"]);
  });

  test("admin reply keyboard section hubs are primary and navigation is default", () => {
    const keyboard = AdminKeyboard().reply_markup.keyboard as any[][];
    expect(isBalanced(keyboard)).toBe(true);
    expect(styles(keyboard).slice(0, 4).flat().every((style) => style === "primary")).toBe(true);
    expect(styles(keyboard)[4]).toEqual(["default"]);
  });
});
