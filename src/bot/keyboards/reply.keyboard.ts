import { Markup } from "telegraf";
import type { PanelViewId } from "../navigation/panel-ui";

export type ReplyKeyboardScope =
  | "home"
  | "shop"
  | "profile"
  | "wallet"
  | "support"
  | "freeAccount"
  | "admin";

const keyboards: Record<ReplyKeyboardScope, string[][]> = {
  home: [
    ["🛒 فروشگاه", "📦 اکانت‌های من"],
    ["👤 پروفایل", "💰 کیف پول"],
    ["🆓 اکانت تست", "🎧 پشتیبانی"],
  ],
  shop: [
    ["🛒 فروشگاه", "📦 اکانت‌های من"],
    ["🆓 اکانت تست", "🔄 بروزرسانی"],
  ],
  profile: [
    ["👤 پروفایل", "💰 کیف پول"],
    ["📦 اکانت‌های من", "🏠 منوی اصلی"],
  ],
  wallet: [
    ["➕ شارژ حساب", "💳 تراکنش‌ها"],
    ["🏠 منوی اصلی"],
  ],
  support: [
    ["➕ تیکت جدید", "📂 تیکت‌های من"],
    ["🏠 منوی اصلی"],
  ],
  freeAccount: [
    ["🎁 دریافت اکانت تست", "📦 اکانت‌های من"],
    ["🏠 منوی اصلی"],
  ],
  admin: [
    ["📊 آمار", "🛒 محصولات"],
    ["📂 دسته‌بندی‌ها", "💳 پرداخت‌ها"],
    ["⚙️ تنظیمات", "🏠 منوی اصلی"],
  ],
};

export function replyKeyboard(scope: ReplyKeyboardScope) {
  return Markup.keyboard(keyboards[scope]).resize().persistent();
}

export function replyKeyboardSignature(scope: ReplyKeyboardScope) {
  return keyboards[scope].map((row) => row.join("|")).join("||");
}

export function quickReplyTarget(text: string) {
  const targets: Record<string, { id: PanelViewId; params?: Record<string, string> } | "refresh" | "claimFree" | "newTicket"> = {
    "🛒 فروشگاه": { id: "shop.categories" },
    "📦 اکانت‌های من": { id: "account.details" },
    "🆓 اکانت تست": { id: "freeAccount" },
    "🔄 بروزرسانی": "refresh",
    "👤 پروفایل": { id: "account" },
    "💰 کیف پول": { id: "wallet" },
    "🏠 منوی اصلی": { id: "home" },
    "➕ شارژ حساب": { id: "deposit" },
    "💳 تراکنش‌ها": { id: "wallet.history" },
    "➕ تیکت جدید": "newTicket",
    "📂 تیکت‌های من": { id: "support" },
    "🎁 دریافت اکانت تست": "claimFree",
    "📊 آمار": { id: "admin.analytics" },
    "🛒 محصولات": { id: "admin.products" },
    "📂 دسته‌بندی‌ها": { id: "admin.categories" },
    "💳 پرداخت‌ها": { id: "admin.paymentGateway" },
    "⚙️ تنظیمات": { id: "admin.settings" },
    "🎧 پشتیبانی": { id: "support" },
  };
  return targets[text];
}
