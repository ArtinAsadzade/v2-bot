import type { UiKeyboard } from "../navigation/panel-ui";
import { nav, supportCallbacks } from "../callbacks";
import { navRow } from "./panel-keyboard.helpers";

export const homeKeyboard = (isAdmin: boolean): UiKeyboard => {
  const keyboard: UiKeyboard = [
    navRow({ text: "🛒 خرید سرویس", view: "shop" }, { text: "🎁 تست رایگان", view: "freeAccount", tone: "success" }),
    navRow({ text: "📦 سرویس‌های من", view: "services" }, { text: "👤 حساب کاربری", view: "account" }),
    navRow({ text: "💳 کیف پول", view: "wallet" }, { text: "🎟 دعوت دوستان", view: "referral" }),
    navRow({ text: "🆘 پشتیبانی", view: "support" }, { text: "📘 راهنما", view: "help" }),
  ];
  if (isAdmin) keyboard.push(navRow({ text: "🛠 پنل مدیریت", view: "admin.dashboard" }));
  return keyboard;
};

export const supportCloseHomeInlineKeyboard = (ticketId: string) => ({
  inline_keyboard: [[{ text: "✅ بستن تیکت", callback_data: supportCallbacks.close(ticketId) }], [{ text: "🏠 خانه", callback_data: nav.home() }]],
});
