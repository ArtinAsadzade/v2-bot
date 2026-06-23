import type { InlineKeyboardButton, InlineKeyboardMarkup, KeyboardButton, ReplyKeyboardMarkup } from "telegraf/types";
import { callbackFor, ensureCallbackData, type PanelViewId } from "../navigation/panel-ui";
import { buttonIntent, styledButtonFields, type ButtonIntent, type TelegramButtonStyle, type UiButtonStyle, type UiButtonTone } from "../ui/button-style";
import { normalizeKeyboardRows } from "./keyboard-normalizer";

export type ButtonTone = UiButtonTone;
export type ButtonStyle = UiButtonStyle;

type StyledKeyboardButton = KeyboardButton & { style?: TelegramButtonStyle; icon_custom_emoji_id?: string };
type StyledInlineKeyboardButton = InlineKeyboardButton.CallbackButton & { style?: TelegramButtonStyle; icon_custom_emoji_id?: string };
type StyledUrlInlineKeyboardButton = InlineKeyboardButton.UrlButton & { style?: TelegramButtonStyle; icon_custom_emoji_id?: string };

type ButtonStyleFields = { tone?: ButtonTone; style?: ButtonTone; intent?: ButtonIntent; customEmojiId?: string };
type ReplyButton = KeyboardButton.CommonButton & ButtonStyleFields;
type InlineCallbackButton = { text: string; action: string } & ButtonStyleFields;
type InlineUrlButton = { text: string; url: string } & ButtonStyleFields;
export type InlineButton = InlineCallbackButton | InlineUrlButton;

export type ReplyKeyboardScope = "home" | "shop" | "profile" | "wallet" | "payment" | "support" | "freeAccount" | "admin" | "settings";

export const labels = {
  home: "🏠 خانه",
  userMenu: "🏠 منوی کاربر",
  wallet: "💳 کیف پول",
  walletBalance: "💳 موجودی فعلی",
  topup: "➕ شارژ کیف پول",
  transactions: "📜 تاریخچه تراکنش‌ها",
  instantPayment: "⚡ پرداخت آنی",
  walletPayment: "💳 پرداخت با کیف پول",
  shop: "📦 خرید سرویس",
  shopLegacy: "🛒 فروشگاه",
  buyAgain: "🛒 خرید مجدد",
  coupon: "🎟 تخفیف‌ها",
  account: "👤 حساب من",
  freeAccount: "🎁 دریافت تست رایگان",
  referral: "🎁 دعوت دوستان",
  orders: "🧩 سرویس‌های من",
  support: "🆘 پشتیبانی",
  guide: "📘 راهنما",
  settings: "⚙️ تنظیمات",
  retry: "🔄 تلاش مجدد",
  refresh: "🔄 بروزرسانی وضعیت",
  back: "🔙 بازگشت",
  cancel: "❌ لغو عملیات",
  paymentSuccess: "✅ موفق",
  paymentFailure: "❌ ناموفق",
  adminStats: "📊 داشبورد",
  adminStore: "🛒 فروشگاه",
  adminFinance: "💳 مالی",
  adminUsersSupport: "👥 کاربران و پشتیبانی",
  adminContent: "📢 محتوا و اطلاع‌رسانی",
  adminBotSettings: "⚙️ تنظیمات بات",
  adminMonitoring: "🛡 مانیتورینگ سیستم",
  adminPayments: "💳 پرداخت‌ها",
  adminProducts: "📦 محصولات",
  adminCategories: "📂 دسته‌بندی‌ها",
  adminInventory: "🗄 موجودی اکانت‌ها",
  adminUsers: "👥 کاربران",
  adminTickets: "🎫 تیکت‌ها",
  adminNotifications: "📢 اطلاع‌رسانی",
  adminCoupons: "🎟 کدهای تخفیف",
  adminDashboard: "🛠 پنل مدیریت",
} as const;

function buttonDecorations(button: ButtonStyleFields) {
  const tone = button.tone ?? button.style ?? (button.intent ? buttonIntent[button.intent] : undefined);
  return { ...styledButtonFields({ ...button, tone }), ...(button.customEmojiId ? { icon_custom_emoji_id: button.customEmojiId } : {}) };
}

function replyButton(button: ReplyButton): StyledKeyboardButton {
  const { tone: _tone, style: _style, intent: _intent, customEmojiId: _customEmojiId, ...telegramButton } = button as KeyboardButton.CommonButton & ButtonStyleFields;
  return { ...telegramButton, ...buttonDecorations(button) } as StyledKeyboardButton;
}

function inlineButton(button: InlineButton): StyledInlineKeyboardButton | StyledUrlInlineKeyboardButton {
  if ("url" in button) return { text: button.text, url: button.url, ...buttonDecorations(button) };
  return { text: button.text, callback_data: ensureCallbackData(button.action), ...buttonDecorations(button) };
}

export function buildReplyKeyboard(rows: ReplyButton[][]): { reply_markup: ReplyKeyboardMarkup } {
  const normalizedRows = normalizeKeyboardRows(rows);
  return {
    reply_markup: {
      keyboard: normalizedRows.map((row) => row.map(replyButton)),
      resize_keyboard: true,
      is_persistent: true,
    },
  };
}

export function buildInlineKeyboard(rows: InlineButton[][]): { reply_markup: InlineKeyboardMarkup } {
  const normalizedRows = normalizeKeyboardRows(rows);
  return { reply_markup: { inline_keyboard: normalizedRows.map((row) => row.map(inlineButton)) } };
}

export function MainMenuKeyboard(isAdmin = false) {
  const rows: ReplyButton[][] = [
    [{ text: "🛒 خرید سرویس", intent: "buy" }, { text: labels.freeAccount, intent: "test" }],
    [{ text: labels.orders, intent: "services" }, { text: labels.wallet, intent: "wallet" }],
    [{ text: "🔮 پیش‌بینی", intent: "navigation" }, { text: labels.referral, intent: "navigation" }],
    [{ text: labels.support, intent: "support" }, { text: "📢 اطلاعیه‌ها", intent: "navigation" }],
    [{ text: labels.guide, intent: "back" }],
  ];
  if (isAdmin) rows.push([{ text: labels.adminDashboard, intent: "navigation" }]);
  return buildReplyKeyboard(rows);
}
export function UserKeyboard() {
  return MainMenuKeyboard();
}

export function WalletKeyboard() {
  return MainMenuKeyboard();
}

export function ShopKeyboard() {
  return MainMenuKeyboard();
}

export function PurchaseKeyboard() {
  return ShopKeyboard();
}

export function SupportKeyboard() {
  return MainMenuKeyboard();
}

export function AdminKeyboard() {
  return buildReplyKeyboard([
    [{ text: "📦 فروشگاه", intent: "products" }, { text: "👥 کاربران", intent: "users" }],
    [{ text: "🧩 Xray", intent: "xray" }, { text: labels.adminFinance, intent: "wallet" }],
    [{ text: "🔮 پیش‌بینی", intent: "navigation" }, { text: "📣 اطلاع‌رسانی", intent: "navigation" }],
    [{ text: "⚙️ تنظیمات", intent: "navigation" }, { text: "📊 آمار", intent: "stats" }],
    [{ text: labels.userMenu, intent: "home" }],
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
    [{ text: labels.topup, action: callbackFor("deposit"), tone: "primary" }],
    [{ text: labels.transactions, action: callbackFor("wallet.history") }],
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
    [{ text: "💳 پرداخت", url: paymentLink, tone: "success" }],
    [
      { text: "🔄 بررسی وضعیت", action: backAction },
      { text: labels.support, action: callbackFor("support") },
      { text: labels.home, action: callbackFor("home") },
    ],
  ]);
}

export function paymentSuccessKeyboard(_type: "wallet" | "product") {
  return buildInlineKeyboard([
    [{ text: labels.orders, action: callbackFor("account.details"), tone: "success" }, { text: labels.buyAgain, action: callbackFor("shop.categories"), tone: "primary" }],
    [{ text: labels.home, action: callbackFor("home") }],
  ]);
}

export function paymentFailureKeyboard() {
  return buildInlineKeyboard([
    [{ text: labels.retry, action: callbackFor("deposit"), tone: "primary" }, { text: labels.support, action: callbackFor("support"), tone: "danger" }],
    [{ text: labels.home, action: callbackFor("home") }],
  ]);
}

export const quickReplyRoutes: Record<string, { id: PanelViewId; params?: Record<string, string> } | "refresh" | "claimFree" | "newTicket"> = {
  ["🛒 خرید سرویس"]: { id: "shop.categories" },
  [labels.shop]: { id: "shop.categories" },
  [labels.buyAgain]: { id: "shop.categories" },
  [labels.orders]: { id: "account.details" },
  "♻️ تمدید سرویس": { id: "account.renew" },
  [labels.account]: { id: "account" },
  [labels.freeAccount]: { id: "freeAccount" },
  [labels.guide]: { id: "productGuide" },
  ["🔮 پیش‌بینی"]: { id: "prediction" },
  [labels.referral]: { id: "referral" },
  "📢 اطلاعیه‌ها": { id: "referral" },
  "🎁 اکانت تست": { id: "freeAccount" },
  [labels.refresh]: "refresh",
  [labels.retry]: { id: "deposit" },
  "🔄 بروزرسانی": "refresh",
  "👤 پروفایل": { id: "account" },
  [labels.wallet]: { id: "wallet" },
  [labels.walletBalance]: { id: "wallet" },
  "💸 برداشت‌ها": { id: "referral" },
  "🎁 پاداش‌ها": { id: "referral" },
  [labels.home]: { id: "home" },
  [labels.userMenu]: { id: "home" },
  [labels.topup]: { id: "deposit" },
  "➕ شارژ حساب": { id: "deposit" },
  [labels.transactions]: { id: "wallet.history" },
  "💳 تراکنش‌ها": { id: "wallet.history" },
  [labels.instantPayment]: { id: "shop.categories" },
  "➕ تیکت جدید": "newTicket",
  "📂 تیکت‌های من": { id: "support" },
  "🎁 دریافت اکانت تست": "claimFree",
  [labels.adminStats]: { id: "admin.dashboard" },
  [labels.adminFinance]: { id: "admin.finance" },
  [labels.adminUsersSupport]: { id: "admin.usersSupport" },
  [labels.adminContent]: { id: "admin.content" },
  [labels.adminBotSettings]: { id: "admin.botSettings" },
  [labels.adminMonitoring]: { id: "admin.monitoring" },
  [labels.adminProducts]: { id: "admin.products" },
  [labels.adminCategories]: { id: "admin.categories" },
  [labels.adminInventory]: { id: "admin.accounts" },
  [labels.adminPayments]: { id: "admin.paymentGateway" },
  [labels.adminUsers]: { id: "admin.users" },
  [labels.adminTickets]: { id: "admin.tickets" },
  [labels.adminNotifications]: { id: "admin.notifications" },
  [labels.adminCoupons]: { id: "admin.coupons" },
  [labels.settings]: { id: "admin.botSettings" },
  [labels.adminDashboard]: { id: "admin.dashboard" },
  [labels.support]: { id: "support" },
  "🎧 پشتیبانی": { id: "support" },
};

export function privateTopicArchitecture() {
  return {
    enabled: process.env.TELEGRAM_PRIVATE_TOPICS_ENABLED === "true",
    topics: { payments: "💳 پرداخت‌ها", support: "🆘 پشتیبانی", orders: "📦 سفارش‌ها", announcements: "📢 اطلاعیه‌ها" },
  };
}
