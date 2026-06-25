import type { AppContext } from "../../types/bot";
import type { UiKeyboard } from "../navigation/panel-ui";
import { actionFor } from "../navigation/panel-ui";
import {
  BOT_TIME_ZONE,
  getSelectableJalaliYears,
  jalaliMonthLength,
  PERSIAN_MONTH_NAMES,
} from "../../utils/persianDateTime";
import { PredictionDateService } from "../../modules/prediction/prediction-date.service";

export type DateTimePickerFlow = "prediction.create.closesAt" | "prediction.edit.closesAt";
export type DateTimePickerState = {
  flow: DateTimePickerFlow;
  returnView?: string;
  contestId?: string;
  selectedYear?: number;
  selectedMonth?: number;
  selectedDay?: number;
  selectedHour?: number;
  selectedMinute?: number;
};

const fa = (n: number) => n.toLocaleString("fa-IR", { useGrouping: false });
const pad = (n: number) => n.toString().padStart(2, "0");
const isValidPickerButton = (button: { text?: string; action?: string }) =>
  Boolean(button.text?.trim()) && !/NaN|undefined|null/.test(button.text ?? "") && Boolean(button.action?.trim());
const row = <T>(items: T[], size: number) => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, i * size + size));
const safeRows = (keyboard: UiKeyboard): UiKeyboard =>
  keyboard.map((buttons) => buttons.filter(isValidPickerButton)).filter((buttons) => buttons.length > 0);
export const dtpAction = (...parts: (string | number)[]) => actionFor("dtp", ...parts);
export function startPersianDateTimePicker(ctx: AppContext, state: DateTimePickerState) {
  ctx.session.dateTimePicker = { ...state };
}
export function selectedPickerDate(state: DateTimePickerState) {
  return PredictionDateService.fromJalaliSelection(state.selectedYear!, state.selectedMonth!, state.selectedDay!, state.selectedHour!, state.selectedMinute!);
}
export function pickerText(state: DateTimePickerState, step: string) {
  const title = "📅 انتخاب زمان بسته شدن";
  if (step === "year") return `${title}\n\nسال شمسی را انتخاب کنید.`;
  if (step === "month") return `${title}\n\nسال: ${fa(state.selectedYear!)}\nماه را انتخاب کنید.`;
  if (step === "day") return `${title}\n\n${PERSIAN_MONTH_NAMES[state.selectedMonth! - 1]} ${fa(state.selectedYear!)}\nروز را انتخاب کنید.`;
  if (step === "hour") return `${title}\n\nساعت را انتخاب کنید.`;
  if (step === "minute") return `${title}\n\nدقیقه را انتخاب کنید.`;
  const d = selectedPickerDate(state);
  return `📅 پیش‌نمایش زمان\n\nزمان بسته شدن: ${PredictionDateService.formatPredictionDate(d)}\nTimezone: ${BOT_TIME_ZONE}\n\nآیا تأیید می‌کنید؟`;
}
export function pickerKeyboard(state: DateTimePickerState, step: string): UiKeyboard {
  if (step === "year") {
    const yearButtons = getSelectableJalaliYears().map((year) => ({ text: fa(year), action: dtpAction("y", year), tone: "primary" as const }));
    return safeRows([...row(yearButtons, 2), []]);
  }
  if (step === "month")
    return safeRows([
      ...row(
        PERSIAN_MONTH_NAMES.map((m, i) => ({ text: m, action: dtpAction("m", i + 1), tone: "primary" as const })),
        2,
      ),
      [
        { text: "🔙 تغییر سال", action: dtpAction("back", "year"), tone: "neutral" as const },
        { text: "❌ لغو", action: dtpAction("cancel"), tone: "danger" as const },
      ],
    ]);
  if (step === "day") {
    const days = Array.from({ length: jalaliMonthLength(state.selectedYear!, state.selectedMonth!) }, (_, i) => i + 1);
    return safeRows([
      ...row(
        days.map((d) => ({ text: fa(d), action: dtpAction("d", d), tone: "primary" as const })),
        7,
      ),
      [
        { text: "🔙 تغییر ماه", action: dtpAction("back", "month"), tone: "neutral" as const },
        { text: "❌ لغو", action: dtpAction("cancel"), tone: "danger" as const },
      ],
    ]);
  }
  if (step === "hour")
    return safeRows([
      ...row(
        Array.from({ length: 24 }, (_, i) => ({ text: pad(i), action: dtpAction("h", i), tone: "primary" as const })),
        4,
      ),
      [
        { text: "🔙 تغییر روز", action: dtpAction("back", "day"), tone: "neutral" as const },
        { text: "❌ لغو", action: dtpAction("cancel"), tone: "danger" as const },
      ],
    ]);
  if (step === "minute")
    return safeRows([
      ...row(
        Array.from({ length: 12 }, (_, i) => i * 5).map((m) => ({ text: pad(m), action: dtpAction("min", m), tone: "primary" as const })),
        4,
      ),
      [
        { text: "🔙 تغییر ساعت", action: dtpAction("back", "hour"), tone: "neutral" as const },
        { text: "❌ لغو", action: dtpAction("cancel"), tone: "danger" as const },
      ],
    ]);
  return safeRows([
    [{ text: "✅ تأیید زمان", action: dtpAction("confirm"), tone: "success" as const }],
    [
      { text: "🔙 تغییر", action: dtpAction("back", "year"), tone: "neutral" as const },
      { text: "❌ لغو", action: dtpAction("cancel"), tone: "danger" as const },
    ],
  ]);
}
export const pickerStepFromState = (s: DateTimePickerState) =>
  !s.selectedYear
    ? "year"
    : !s.selectedMonth
      ? "month"
      : !s.selectedDay
        ? "day"
        : s.selectedHour === undefined
          ? "hour"
          : s.selectedMinute === undefined
            ? "minute"
            : "confirm";
