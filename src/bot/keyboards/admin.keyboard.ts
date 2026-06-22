import { callbackFor } from "../navigation/panel-ui";
import { buildInlineKeyboard } from "./design-system";

export function adminKeyboard() {
  return buildInlineKeyboard([
    [
      { text: "📊 آمار", action: callbackFor("admin.analytics"), tone: "primary" },
      { text: "💳 پرداخت‌ها", action: callbackFor("admin.paymentGateway") },
      { text: "🛡 مانیتورینگ سیستم", action: "admin:monitoring" },
    ],
    [
      { text: "📦 محصولات", action: callbackFor("admin.products") },
      { text: "📂 مدیریت دسته‌بندی‌ها", action: callbackFor("admin.categories") },
    ],
    [
      { text: "👥 کاربران", action: callbackFor("admin.users") },
      { text: "🎟 تخفیف‌ها", action: callbackFor("admin.coupons") },
    ],
    [
      { text: "🗄 موجودی اکانت‌ها", action: callbackFor("admin.accounts") },
      { text: "💳 واریزی‌ها", action: callbackFor("admin.deposits") },
    ],
    [
      { text: "🧾 فاکتورهای پرداخت", action: callbackFor("admin.invoices") },
      { text: "🎫 پشتیبانی", action: callbackFor("admin.tickets") },
    ],
    [{ text: "🧩 Xray Center", action: callbackFor("admin.xrayCenter"), tone: "primary" }],
    [
      { text: "➕ محصول جدید", action: "flow:start:product_create", tone: "primary" },
      { text: "📦 سفارش‌ها", action: callbackFor("admin.orders") },
    ],
    [{ text: "🏠 منوی اصلی", action: callbackFor("home") }],
  ]);
}
