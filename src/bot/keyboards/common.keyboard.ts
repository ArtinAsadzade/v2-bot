import type { UiKeyboard } from "../navigation/panel-ui";
import { nav, supportCallbacks } from "../callbacks";
import { navRow } from "./panel-keyboard.helpers";
import { labels } from "./design-system";

export const homeKeyboard = (isAdmin: boolean): UiKeyboard => {
  const keyboard: UiKeyboard = [
    navRow({ text: "🛒 خرید سرویس", view: "shop", tone: "success" }, { text: "🎁 تست رایگان", view: "freeAccount", tone: "success" }),
    navRow({ text: labels.orders, view: "services", tone: "primary" }, { text: "💳 کیف پول", view: "wallet", tone: "primary" }),
    navRow({ text: "🎁 دعوت دوستان", view: "referral", tone: "success" }, { text: "🔮 پیش‌بینی", view: "prediction", tone: "success" }),
    navRow({ text: "🆘 پشتیبانی", view: "support", tone: "primary" }, { text: "👤 پروفایل", view: "account", tone: "primary" }),
    navRow({ text: "📘 راهنما", view: "productGuide", tone: "success" }),
  ];
  if (isAdmin) keyboard.push(navRow({ text: "🛠 پنل مدیریت", view: "admin.dashboard", tone: "warning" }));
  return keyboard;
};

export const supportCloseHomeInlineKeyboard = (ticketId: string) => ({
  inline_keyboard: [
    [{ text: "✅ بستن تیکت", callback_data: supportCallbacks.close(ticketId), style: "success" }],
    [{ text: "🏠 خانه", callback_data: nav.home() }],
  ],
});
