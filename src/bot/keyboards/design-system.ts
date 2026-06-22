import type { InlineKeyboardButton, InlineKeyboardMarkup, KeyboardButton, ReplyKeyboardMarkup } from "telegraf/types";
import { callbackFor, ensureCallbackData, type PanelViewId } from "../navigation/panel-ui";

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

const toneToStyle: Record<Exclude<ButtonTone, "neutral">, TelegramButtonStyle> = {
  primary: "primary",
  success: "success",
  danger: "danger",
  warning: "warning",
};

// Telegram does not expose arbitrary button colors; tones are layout hints only.
function buttonDecorations(_button: ButtonStyleFields) {
  // Telegram inline keyboards do not support arbitrary colors/backgrounds.
  // Keep tone metadata internal and send only standard Bot API button fields.
  return {};
}

function replyButton(button: ReplyButton): StyledKeyboardButton {
  return { text: button.text, ...buttonDecorations(button) };
}

function inlineButton(button: InlineButton): StyledInlineKeyboardButton | StyledUrlInlineKeyboardButton {
  if ("url" in button) return { text: button.text, url: button.url, ...buttonDecorations(button) };
  return { text: button.text, callback_data: ensureCallbackData(button.action), ...buttonDecorations(button) };
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

export function MainMenuKeyboard(isAdmin = false) {
  const rows: ReplyButton[][] = [
    [{ text: labels.shop }, { text: labels.freeAccount }],
    [{ text: labels.orders }, { text: "♻️ تمدید سرویس" }],
    [{ text: labels.account }, { text: labels.wallet }],
    [{ text: labels.support }, { text: "📢 اطلاعیه‌ها" }],
    [{ text: labels.guide }],
  ];
  if (isAdmin) rows.push([{ text: labels.adminDashboard }]);
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
    [{ text: labels.adminStats }, { text: labels.adminStore }],
    [{ text: labels.adminFinance }, { text: labels.adminUsersSupport }],
    [{ text: labels.adminContent }, { text: labels.adminBotSettings }],
    [{ text: labels.adminMonitoring }],
    [{ text: labels.userMenu }],
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
  [labels.shop]: { id: "shop.categories" },
  [labels.buyAgain]: { id: "shop.categories" },
  [labels.orders]: { id: "account.details" },
  "♻️ تمدید سرویس": { id: "account.renew" },
  [labels.account]: { id: "account" },
  [labels.freeAccount]: { id: "freeAccount" },
  [labels.guide]: { id: "productGuide" },
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
