import type { InlineKeyboardButton, InlineKeyboardMarkup, KeyboardButton, ReplyKeyboardMarkup } from "telegraf/types";
import type { PanelViewId } from "../navigation/panel-ui";

export type ButtonTone = "primary" | "success" | "danger" | "warning" | "neutral";
export type TelegramButtonStyle = "primary" | "success" | "danger" | "warning";

type StyledKeyboardButton = KeyboardButton & { style?: TelegramButtonStyle; icon_custom_emoji_id?: string };
type StyledInlineKeyboardButton = InlineKeyboardButton.CallbackButton & { style?: TelegramButtonStyle; icon_custom_emoji_id?: string };
type StyledUrlInlineKeyboardButton = InlineKeyboardButton.UrlButton & { style?: TelegramButtonStyle; icon_custom_emoji_id?: string };

type ButtonStyleFields = { tone?: ButtonTone; customEmojiId?: string };
type ReplyButton = { text: string } & ButtonStyleFields;
type InlineCallbackButton = { text: string; action: string } & ButtonStyleFields;
type InlineUrlButton = { text: string; url: string } & ButtonStyleFields;
type InlineButton = InlineCallbackButton | InlineUrlButton;

export type ReplyKeyboardScope = "home" | "shop" | "profile" | "wallet" | "payment" | "support" | "freeAccount" | "admin" | "settings";

export const labels = {
  home: "🏠 خانه",
  wallet: "💳 کیف پول",
  walletBalance: "💳 موجودی فعلی",
  topup: "➕ شارژ کیف پول",
  transactions: "📜 تاریخچه تراکنش‌ها",
  instantPayment: "⚡ پرداخت آنی",
  walletPayment: "💳 پرداخت با کیف پول",
  shop: "🛒 فروشگاه",
  shopLegacy: "🛒 فروشگاه",
  buyAgain: "🛒 خرید مجدد",
  coupon: "🎟 تخفیف‌ها",
  orders: "📦 اکانت‌های من",
  support: "🎫 پشتیبانی",
  settings: "⚙️ تنظیمات",
  retry: "🔄 تلاش مجدد",
  refresh: "🔄 بروزرسانی وضعیت",
  back: "🔙 بازگشت",
  cancel: "❌ لغو عملیات",
  paymentSuccess: "✅ موفق",
  paymentFailure: "❌ ناموفق",
  adminStats: "📊 آمار",
  adminPayments: "💳 پرداخت‌ها",
  adminProducts: "📦 محصولات",
  adminCategories: "📂 دسته‌بندی‌ها",
  adminUsers: "👥 کاربران",
  adminCoupons: "🎟 تخفیف‌ها",
  adminDashboard: "🛠 پنل مدیریت",
} as const;

const toneToStyle: Record<Exclude<ButtonTone, "neutral">, TelegramButtonStyle> = {
  primary: "primary",
  success: "success",
  danger: "danger",
  warning: "warning",
};

// Compatibility check (2026-06-13): official Bot API 9.4 exposes
// KeyboardButton/InlineKeyboardButton `style` and `icon_custom_emoji_id`, while
// Telegraf 4.16.3 can send unknown raw fields but its bundled types lag behind.
// The premium fields are therefore opt-in raw payload decorations with a safe
// fallback: set TELEGRAM_BUTTON_STYLE_ENABLED=false or TELEGRAM_CUSTOM_EMOJI_ENABLED=false
// for older self-hosted Bot API servers or bots that cannot use premium emoji.
function buttonDecorations(button: ButtonStyleFields) {
  const styleEnabled = process.env.TELEGRAM_BUTTON_STYLE_ENABLED !== "false";
  const customEmojiEnabled = process.env.TELEGRAM_CUSTOM_EMOJI_ENABLED === "true";
  return {
    ...(styleEnabled && button.tone && button.tone !== "neutral" ? { style: toneToStyle[button.tone] } : {}),
    ...(customEmojiEnabled && button.customEmojiId ? { icon_custom_emoji_id: button.customEmojiId } : {}),
  };
}

function replyButton(button: ReplyButton): StyledKeyboardButton {
  return { text: button.text, ...buttonDecorations(button) };
}

function inlineButton(button: InlineButton): StyledInlineKeyboardButton | StyledUrlInlineKeyboardButton {
  if ("url" in button) return { text: button.text, url: button.url, ...buttonDecorations(button) };
  return { text: button.text, callback_data: button.action, ...buttonDecorations(button) };
}

export function buildReplyKeyboard(rows: ReplyButton[][]): { reply_markup: ReplyKeyboardMarkup } {
  return {
    reply_markup: {
      keyboard: rows.map((row) => row.map(replyButton)),
      resize_keyboard: true,
      is_persistent: true,
    },
  };
}

export function buildInlineKeyboard(rows: InlineButton[][]): { reply_markup: InlineKeyboardMarkup } {
  return { reply_markup: { inline_keyboard: rows.map((row) => row.map(inlineButton)) } };
}

export function MainMenuKeyboard() {
  return buildReplyKeyboard([
    [{ text: labels.home }, { text: labels.shop }],
    [{ text: labels.wallet }, { text: labels.orders }],
    [{ text: "🎁 اکانت تست" }, { text: labels.support }],
  ]);
}

export function UserKeyboard() {
  return MainMenuKeyboard();
}

export function WalletKeyboard() {
  return buildReplyKeyboard([
    [{ text: labels.home }, { text: labels.wallet }],
    [{ text: labels.shop }, { text: labels.orders }],
    [{ text: "🎁 اکانت تست" }, { text: labels.support }],
  ]);
}

export function ShopKeyboard() {
  return buildReplyKeyboard([
    [{ text: labels.home }, { text: labels.shop }],
    [{ text: labels.wallet }, { text: labels.orders }],
    [{ text: "🎁 اکانت تست" }, { text: labels.support }],
  ]);
}

export function PurchaseKeyboard() {
  return ShopKeyboard();
}

export function SupportKeyboard() {
  return buildReplyKeyboard([
    [{ text: labels.home }, { text: labels.support }],
    [{ text: labels.shop }, { text: labels.wallet }],
    [{ text: labels.orders }, { text: "🎁 اکانت تست" }],
  ]);
}

export function AdminKeyboard() {
  return buildReplyKeyboard([
    [{ text: labels.adminStats }, { text: labels.adminProducts }],
    [{ text: labels.adminUsers }, { text: labels.adminPayments }],
    [{ text: labels.settings }],
  ]);
}

export function AdminProductsKeyboard() {
  return AdminKeyboard();
}

export function AdminPaymentsKeyboard() {
  return AdminKeyboard();
}

export function AdminUsersKeyboard() {
  return AdminKeyboard();
}

export function AdminSettingsKeyboard() {
  return AdminKeyboard();
}

export function WalletActionKeyboard() {
  return buildInlineKeyboard([
    [{ text: labels.topup, action: "nav:deposit", tone: "primary" }],
    [{ text: labels.transactions, action: "nav:wallet.history" }],
  ]);
}

export function PaymentKeyboard() {
  return MainMenuKeyboard();
}

export function SettingsKeyboard() {
  return AdminKeyboard();
}

export function InvoiceActionKeyboard(paymentLink: string, backAction: string) {
  return buildInlineKeyboard([
    [{ text: labels.instantPayment, url: paymentLink, tone: "success" }],
    [
      { text: labels.back, action: backAction },
      { text: labels.home, action: "home" },
    ],
  ]);
}

export function paymentSuccessKeyboard(_type: "wallet" | "product") {
  return buildReplyKeyboard([[{ text: labels.home }, { text: labels.buyAgain, tone: "primary" }], [{ text: labels.orders, tone: "success" }]]);
}

export function paymentFailureKeyboard() {
  return buildReplyKeyboard([
    [
      { text: labels.retry, tone: "primary" },
      { text: labels.support, tone: "danger" },
    ],
    [{ text: labels.home }],
  ]);
}

export const quickReplyRoutes: Record<string, { id: PanelViewId; params?: Record<string, string> } | "refresh" | "claimFree" | "newTicket"> = {
  [labels.shop]: { id: "shop.categories" },
  [labels.buyAgain]: { id: "shop.categories" },
  [labels.orders]: { id: "account.details" },
  "🎁 اکانت تست": { id: "freeAccount" },
  "🆓 اکانت تست": { id: "freeAccount" },
  [labels.refresh]: "refresh",
  "🔄 بروزرسانی": "refresh",
  "👤 پروفایل": { id: "account" },
  [labels.wallet]: { id: "wallet" },
  [labels.walletBalance]: { id: "wallet" },
  "💸 برداشت‌ها": { id: "referral" },
  "🎁 پاداش‌ها": { id: "referral" },
  [labels.home]: { id: "home" },
  [labels.topup]: { id: "deposit" },
  "➕ شارژ حساب": { id: "deposit" },
  [labels.transactions]: { id: "wallet.history" },
  "💳 تراکنش‌ها": { id: "wallet.history" },
  [labels.instantPayment]: { id: "shop.categories" },
  "➕ تیکت جدید": "newTicket",
  "📂 تیکت‌های من": { id: "support" },
  "🎁 دریافت اکانت تست": "claimFree",
  [labels.adminStats]: { id: "admin.analytics" },
  [labels.adminProducts]: { id: "admin.products" },
  [labels.adminCategories]: { id: "admin.categories" },
  [labels.adminPayments]: { id: "admin.paymentGateway" },
  [labels.adminUsers]: { id: "admin.users" },
  [labels.adminCoupons]: { id: "admin.coupons" },
  [labels.settings]: { id: "admin.settings" },
  [labels.adminDashboard]: { id: "admin.dashboard" },
  [labels.support]: { id: "support" },
  "🎧 پشتیبانی": { id: "support" },
  "📢 اطلاع‌رسانی": { id: "admin.notifications" },
};

export function privateTopicArchitecture() {
  return {
    enabled: process.env.TELEGRAM_PRIVATE_TOPICS_ENABLED === "true",
    topics: { payments: "💳 پرداخت‌ها", support: "🎫 پشتیبانی", orders: "📦 سفارش‌ها", announcements: "📢 اطلاعیه‌ها" },
  };
}
