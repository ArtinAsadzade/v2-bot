export type UiButtonTone = "success" | "info" | "warning" | "danger" | "neutral";

export const buttonPrefixes = {
  success: "✅",
  safe: "🟢",
  info: "🔍",
  warning: "⚠️",
  danger: "🔴",
  cancel: "❌",
  refresh: "🔄",
  payment: "💳",
  invoice: "🧾",
  admin: "🛠",
} as const;

export function dangerLabel(label: string): string {
  return label.startsWith(buttonPrefixes.danger) ? label : `${buttonPrefixes.danger} ${label}`;
}
