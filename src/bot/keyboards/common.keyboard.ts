import type { UiKeyboard } from "../navigation/panel-ui";
import { nav, supportCallbacks } from "../callbacks";
import { navRow } from "./panel-keyboard.helpers";

export const homeKeyboard = (isAdmin: boolean): UiKeyboard => {
  const keyboard: UiKeyboard = [
    navRow({ text: "🛒 خرید سرویس", view: "shop", tone: "success" }, { text: "🎁 تست رایگان", view: "freeAccount", tone: "success" }),
    navRow({ text: "📦 سرویس‌های من", view: "services", tone: "primary" }, { text: "👤 حساب کاربری", view: "account", tone: "primary" }),
    navRow({ text: "💳 کیف پول", view: "wallet", tone: "success" }, { text: "🎟 دعوت دوستان", view: "referral", tone: "success" }),
    navRow({ text: "🆘 پشتیبانی", view: "support", tone: "primary" }, { text: "📘 راهنما", view: "help", tone: "primary" }),
  ];
  if (isAdmin) keyboard.push(navRow({ text: "🛠 پنل مدیریت", view: "admin.dashboard", tone: "danger" }));
  return keyboard;
};

export const supportCloseHomeInlineKeyboard = (ticketId: string) => ({
  inline_keyboard: [[{ text: "✅ بستن تیکت", callback_data: supportCallbacks.close(ticketId) }], [{ text: "🏠 خانه", callback_data: nav.home() }]],
});
