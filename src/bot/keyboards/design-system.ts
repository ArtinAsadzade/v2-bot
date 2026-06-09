import { Markup } from "telegraf";
import type { InlineKeyboardButton, InlineKeyboardMarkup, KeyboardButton, ReplyKeyboardMarkup } from "telegraf/types";
import type { PanelViewId } from "../navigation/panel-ui";

export type ButtonTone = "primary" | "danger" | "neutral";
export type TelegramButtonStyle = "primary" | "danger" | "default";

type StyledKeyboardButton = KeyboardButton & { style?: TelegramButtonStyle; icon_custom_emoji_id?: string };
type StyledInlineKeyboardButton = InlineKeyboardButton.CallbackButton & { style?: TelegramButtonStyle; icon_custom_emoji_id?: string };

type ReplyButton = { text: string; tone?: ButtonTone; customEmojiId?: string };
type InlineButton = { text: string; action: string; tone?: ButtonTone; customEmojiId?: string };

export type ReplyKeyboardScope = "home" | "shop" | "profile" | "wallet" | "payment" | "support" | "freeAccount" | "admin" | "settings";

export const labels = {
  home: "🏠 منوی اصلی",
  wallet: "👛 کیف پول",
  topup: "💳 شارژ کیف پول",
  instantPayment: "💳 پرداخت آنی",
  walletPayment: "👛 پرداخت از کیف پول",
  shop: "🛒 خرید سرویس",
  coupon: "🎁 کد تخفیف",
  orders: "📦 سفارش‌های من",
  support: "🎫 پشتیبانی",
  settings: "⚙️ تنظیمات",
  retry: "🔄 تلاش مجدد",
  refresh: "🔄 بروزرسانی وضعیت",
  back: "🔙 بازگشت",
  adminStats: "📊 آمار",
  adminPayments: "💳 پرداخت‌ها",
  adminProducts: "📦 محصولات",
  adminCategories: "📁 دسته‌بندی‌ها",
  adminUsers: "👥 کاربران",
  adminCoupons: "🎟 تخفیف‌ها",
  adminDashboard: "⚙️ داشبورد ادمین",
} as const;

const toneToStyle: Record<ButtonTone, TelegramButtonStyle> = {
  primary: "primary",
  danger: "danger",
  neutral: "default",
};

function replyButton(button: ReplyButton): StyledKeyboardButton {
  return {
    text: button.text,
    ...(button.tone ? { style: toneToStyle[button.tone] } : {}),
    ...(button.customEmojiId ? { icon_custom_emoji_id: button.customEmojiId } : {}),
  };
}

function callbackButton(button: InlineButton): StyledInlineKeyboardButton {
  return {
    text: button.text,
    callback_data: button.action,
    ...(button.tone ? { style: toneToStyle[button.tone] } : {}),
    ...(button.customEmojiId ? { icon_custom_emoji_id: button.customEmojiId } : {}),
  };
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
  return { reply_markup: { inline_keyboard: rows.map((row) => row.map(callbackButton)) } };
}

export function MainMenuKeyboard(isAdmin = false) {
  const rows: ReplyButton[][] = [
    [{ text: labels.shop, tone: "primary" }, { text: labels.wallet, tone: "primary" }],
    [{ text: labels.orders }, { text: labels.coupon }],
    [{ text: labels.support }, { text: labels.settings }],
  ];
  if (isAdmin) rows.push([{ text: labels.adminDashboard, tone: "primary" }]);
  return buildReplyKeyboard(rows);
}

export function WalletKeyboard() {
  return buildReplyKeyboard([[{ text: labels.topup, tone: "primary" }, { text: "💳 تراکنش‌ها" }], [{ text: labels.home }]]);
}

export function PaymentKeyboard() {
  return buildReplyKeyboard([[{ text: labels.retry, tone: "primary" }, { text: labels.support }], [{ text: labels.wallet }, { text: labels.home }]]);
}

export function PurchaseKeyboard() {
  return buildReplyKeyboard([[{ text: labels.orders, tone: "primary" }, { text: labels.shop }], [{ text: labels.home }]]);
}

export function SupportKeyboard() {
  return buildReplyKeyboard([[{ text: "➕ تیکت جدید", tone: "primary" }, { text: "📂 تیکت‌های من" }], [{ text: labels.home }]]);
}

export function AdminKeyboard() {
  return buildReplyKeyboard([
    [{ text: labels.adminStats, tone: "primary" }, { text: labels.adminPayments }],
    [{ text: labels.adminProducts }, { text: labels.adminCategories }],
    [{ text: labels.adminUsers }, { text: labels.adminCoupons }],
    [{ text: labels.settings }, { text: labels.home }],
  ]);
}

export function SettingsKeyboard() {
  return buildReplyKeyboard([[{ text: labels.wallet }, { text: labels.support }], [{ text: labels.home }]]);
}

export function InvoiceActionKeyboard(paymentLink: string, backAction: string) {
  return Markup.inlineKeyboard([
    [Markup.button.url("✅ پرداخت", paymentLink)],
    [Markup.button.callback(labels.back, backAction)],
  ]);
}

export function paymentSuccessKeyboard(type: "wallet" | "product") {
  return type === "wallet" ? WalletKeyboard() : PurchaseKeyboard();
}

export function paymentFailureKeyboard() {
  return PaymentKeyboard();
}

export const quickReplyRoutes: Record<string, { id: PanelViewId; params?: Record<string, string> } | "refresh" | "claimFree" | "newTicket"> = {
  [labels.shop]: { id: "shop.categories" },
  "🛒 فروشگاه": { id: "shop.categories" },
  [labels.orders]: { id: "account.details" },
  "📦 اکانت‌های من": { id: "account.details" },
  "🆓 اکانت تست": { id: "freeAccount" },
  [labels.refresh]: "refresh",
  "🔄 بروزرسانی": "refresh",
  "👤 پروفایل": { id: "account" },
  [labels.wallet]: { id: "wallet" },
  "💰 کیف پول": { id: "wallet" },
  [labels.home]: { id: "home" },
  [labels.topup]: { id: "deposit" },
  "➕ شارژ حساب": { id: "deposit" },
  "💳 تراکنش‌ها": { id: "wallet.history" },
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
};

export function privateTopicArchitecture() {
  return {
    enabled: process.env.TELEGRAM_PRIVATE_TOPICS_ENABLED === "true",
    topics: { payments: "💳 پرداخت‌ها", support: "🎫 پشتیبانی", orders: "📦 سفارش‌ها", announcements: "📢 اطلاعیه‌ها" },
  };
}
