import { describe, expect, test } from "vitest";
import { isValidCallbackData, panelKeyboard } from "../src/bot/navigation/panel-ui";
import { pickerKeyboard, pickerStepFromState } from "../src/bot/ui/persian-date-time-picker";
import { getSelectableJalaliYears } from "../src/utils/persianDateTime";

const buttons = (keyboard: ReturnType<typeof pickerKeyboard>) => keyboard.flat();
const inlineButtons = (markup: ReturnType<typeof panelKeyboard>) => markup.reply_markup.inline_keyboard.flat();

describe("Persian date time picker", () => {
  test("getSelectableJalaliYears returns exactly 3 valid numbers", () => {
    const years = getSelectableJalaliYears(new Date("2026-06-23T12:00:00Z"));

    expect(years).toHaveLength(3);
    expect(years).toEqual([years[0], years[0] + 1, years[0] + 2]);
    for (const year of years) {
      expect(Number.isInteger(year)).toBe(true);
      expect(year).toBeGreaterThanOrEqual(1300);
    }
  });

  test("year picker renders 3 valid year buttons and one cancel button", () => {
    const keyboard = pickerKeyboard({ flow: "prediction.edit.closesAt" }, "year");
    const allButtons = buttons(keyboard);
    const yearButtons = allButtons.filter((button) => /^dtp:y:\d+$/.test(button.action ?? ""));
    const cancelButtons = allButtons.filter((button) => button.action === "dtp:cancel");

    expect(yearButtons).toHaveLength(3);
    expect(keyboard[0]).toHaveLength(2);
    expect(keyboard[1]).toHaveLength(1);
    expect(cancelButtons).toHaveLength(1);
    for (const button of allButtons) {
      expect(button.text.trim()).not.toBe("");
      expect(button.text).not.toMatch(/NaN|undefined|null/);
    }
  });

  test("year button callback is valid and under 64 bytes", () => {
    const yearButtons = buttons(pickerKeyboard({ flow: "prediction.edit.closesAt" }, "year")).filter((button) => /^dtp:y:\d+$/.test(button.action ?? ""));

    for (const button of yearButtons) {
      expect(isValidCallbackData(button.action!)).toBe(true);
      expect(Buffer.byteLength(button.action!, "utf8")).toBeLessThanOrEqual(64);
    }
  });

  test("selecting a year moves to month step", () => {
    const year = getSelectableJalaliYears()[0];
    expect(pickerStepFromState({ flow: "prediction.edit.closesAt", selectedYear: year })).toBe("month");
  });

  test("month step shows all 12 Persian months", () => {
    const keyboard = pickerKeyboard({ flow: "prediction.edit.closesAt", selectedYear: getSelectableJalaliYears()[0] }, "month");
    const monthButtons = buttons(keyboard).filter((button) => /^dtp:m:\d+$/.test(button.action ?? ""));

    expect(monthButtons).toHaveLength(12);
  });

  test("date picker screens do not get duplicate home/back/cancel navigation", () => {
    const keyboard = pickerKeyboard({ flow: "prediction.edit.closesAt" }, "year");
    const renderedButtons = inlineButtons(panelKeyboard(keyboard, { back: false, home: false, cancel: false }));
    const labels = renderedButtons.map((button) => button.text);

    expect(labels.filter((label) => label.includes("لغو"))).toHaveLength(1);
    expect(labels.some((label) => label.includes("خانه"))).toBe(false);
    expect(labels.some((label) => label.includes("برگشت"))).toBe(false);
  });
});
