export type TelegramButtonStyle = "primary" | "success" | "danger";
export type UiButtonStyle = TelegramButtonStyle | "neutral" | "default";
export type UiButtonTone = UiButtonStyle | "info" | "warning";
export type ButtonIntent =
  | "buy"
  | "pay"
  | "confirm"
  | "primary"
  | "info"
  | "back"
  | "home"
  | "cancel"
  | "delete"
  | "disable"
  | "warning"
  | "support"
  | "wallet"
  | "services"
  | "stats"
  | "xray"
  | "users"
  | "products"
  | "navigation"
  | "create"
  | "activate"
  | "continue"
  | "claimReward"
  | "renew"
  | "test";

export const buttonStyle = {
  intent: {
    buy: "success",
    pay: "success",
    confirm: "success",
    primary: "primary",
    info: "primary",
    back: "neutral",
    home: "neutral",
    cancel: "danger",
    delete: "danger",
    disable: "danger",
    warning: "danger",
    support: "primary",
    wallet: "primary",
    services: "primary",
    stats: "primary",
    xray: "primary",
    users: "primary",
    products: "primary",
    navigation: "primary",
    create: "success",
    activate: "success",
    continue: "success",
    claimReward: "success",
    renew: "success",
    test: "success",
  } satisfies Record<ButtonIntent, UiButtonStyle>,
} as const;

export type ButtonStyleInput = { style?: UiButtonTone; tone?: UiButtonTone; text?: string; action?: string; url?: string };

export function telegramButtonStyle(button: ButtonStyleInput): TelegramButtonStyle | undefined {
  const explicit = button.style ?? button.tone;
  if (explicit === "neutral" || explicit === "default") return undefined;
  if (explicit === "info") return "primary";
  if (explicit === "warning") return "danger";
  if (explicit) return explicit;
  return inferButtonStyle(button);
}

function inferButtonStyle(button: ButtonStyleInput): TelegramButtonStyle | undefined {
  const text = button.text ?? "";
  const action = button.action ?? "";
  if (/حذف|غیرفعال|آرشیو|\bرد\b|ناموفق/.test(text) || /delete|disable|cancel|archive|reject|failed|error/.test(action)) return "danger";
  if (/خرید|پرداخت|تمدید|تست|تأیید|تایید|ذخیره|فعال کردن|افزودن|شارژ|دریافت جایزه|ساخت|ایجاد|ادامه|ثبت|فعال|سینک|همگام/.test(text) || /buy|pay|confirm|renew|freeAccount|deposit|topup|sync|test/.test(action)) return "success";
  if (/سرویس|کیف پول|پشتیبانی|مشکل|اتصال|خطاها|Xray|کاربران|مالی|گزارش|وضعیت|تراکنش|فاکتور|جستجو|تنظیمات|اطلاع|دعوت‌شده|پنل|فروشگاه|محصولات|دسته‌بندی/.test(text) || /wallet|support|xray|admin|ticket|invoice|transaction|search|settings|products|categories|users/.test(action)) return "primary";
  return undefined;
}

export function styledButtonFields(button: ButtonStyleInput): { style?: TelegramButtonStyle } {
  const style = telegramButtonStyle(button);
  return style ? { style } : {};
}

export const buttonIntent = buttonStyle.intent;

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
