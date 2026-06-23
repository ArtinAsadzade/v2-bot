import type { UiButton, UiKeyboard } from "../navigation/panel-ui";
import { callbackFor } from "../navigation/panel-ui";
import { buttonIntent, styledButtonFields, telegramButtonStyle, type ButtonIntent, type TelegramButtonStyle, type UiButtonTone } from "./button-style";

export type UiActionZone = "main" | "management" | "information" | "navigation" | "destructive";
export type UiActionIntent = ButtonIntent | "management" | "destructive" | "completion" | "informational";

export type DesignButton = UiButton & {
  intent?: UiActionIntent;
  zone?: UiActionZone;
};

const NAVIGATION_ACTIONS = new Set(["nav:back", "flow:cancel"]);

export const uiIntentTone = {
  ...buttonIntent,
  management: "primary",
  destructive: "danger",
  completion: "success",
  informational: "primary",
} satisfies Record<UiActionIntent, UiButtonTone>;

export const uiSystem = {
  zones: ["main", "management", "information", "navigation", "destructive"] as const,
  maxButtonsPerRow: 2,
  navigationLabels: { back: "↩️ برگشت", home: "🏠 خانه", cancel: "❌ لغو عملیات" },
  intentTone: uiIntentTone,
} as const;

export function intentForButton(button: DesignButton): UiActionIntent {
  if (button.intent) return button.intent;
  if (button.tone === "danger" || button.style === "danger") return "destructive";
  if (button.tone === "success" || button.style === "success") return "completion";
  if (isNavigationButton(button)) return button.action === "flow:cancel" ? "cancel" : "back";
  if (button.url) return "informational";
  return "management";
}

export function toneForButton(button: DesignButton): UiButtonTone | undefined {
  if (button.tone ?? button.style) return button.tone ?? button.style;
  if (button.intent) return uiIntentTone[button.intent];
  if (isNavigationButton(button)) return undefined;
  if (isDestructiveButtonByLabel(button)) return "danger";
  return undefined;
}

export function isNavigationButton(button: Pick<UiButton, "action" | "text">): boolean {
  return Boolean(button.action && NAVIGATION_ACTIONS.has(button.action)) || /^(↩️|🔙|❌ لغو)/.test(button.text);
}

function isDestructiveButtonByLabel(button: Pick<UiButton, "text" | "action">): boolean {
  return /حذف|آرشیو|غیرفعال|\bرد\b|لغو/.test(button.text) || /delete|archive|disable|reject|cancel/.test(button.action ?? "");
}

export function isDestructiveButton(button: DesignButton): boolean {
  return toneForButton(button) === "danger" || isDestructiveButtonByLabel(button);
}

export function styleForDesignButton(button: DesignButton): { style?: TelegramButtonStyle } {
  return styledButtonFields({ ...button, tone: toneForButton(button) ?? telegramButtonStyle(button) });
}

function chunkBalanced(row: DesignButton[]): DesignButton[][] {
  if (row.length === 0) return [];
  if (row.length <= uiSystem.maxButtonsPerRow) return [row];
  const chunks: DesignButton[][] = [];
  for (let index = 0; index < row.length; index += uiSystem.maxButtonsPerRow) chunks.push(row.slice(index, index + uiSystem.maxButtonsPerRow));
  if (chunks.length > 1 && chunks[chunks.length - 1].length === 1 && chunks[chunks.length - 2].length === 2) {
    chunks[chunks.length - 1].unshift(chunks[chunks.length - 2].pop()!);
  }
  return chunks.filter((chunk) => chunk.length > 0);
}

export function normalizeKeyboardLayout(rows: UiKeyboard): UiKeyboard {
  const output: DesignButton[][] = [];
  for (const sourceRow of rows as DesignButton[][]) {
    const navigation = sourceRow.filter(isNavigationButton);
    const destructive = sourceRow.filter((button) => !isNavigationButton(button) && isDestructiveButton(button));
    const regular = sourceRow.filter((button) => !isNavigationButton(button) && !isDestructiveButton(button));
    for (const row of chunkBalanced(regular)) output.push(row.map(applyIntentTone));
    for (const row of chunkBalanced(destructive)) output.push(row.map(applyIntentTone));
    for (const row of chunkBalanced(navigation)) output.push(row.map(applyIntentTone));
  }
  return output;
}

export function applyIntentTone(button: DesignButton): UiButton {
  return { ...button, tone: toneForButton(button) };
}
