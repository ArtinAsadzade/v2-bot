import { callbackFor, type PanelViewId, type UiButton, type UiButtonTone, type UiKeyboard } from "../navigation/panel-ui";

type ButtonSpec = { text: string; view: PanelViewId; tone?: UiButtonTone; params?: Record<string, string | number | boolean | undefined> };

export const navButton = ({ text, view, params, tone = "primary" }: ButtonSpec): UiButton => ({
  text,
  action: callbackFor(view, params),
  tone,
});

export const navRow = (...buttons: ButtonSpec[]): UiButton[] => buttons.map(navButton);

export const navKeyboard = (...rows: ButtonSpec[][]): UiKeyboard => rows.map((row) => row.map(navButton));

export const backHomeRows = (backTo: PanelViewId): UiKeyboard => [
  navRow({ text: "↩️ بازگشت", view: backTo, tone: "neutral" }, { text: "🏠 خانه", view: "home", tone: "primary" }),
];
