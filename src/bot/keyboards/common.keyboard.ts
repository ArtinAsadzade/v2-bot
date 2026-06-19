import type { UiKeyboard } from "../navigation/panel-ui";
import { nav, supportCallbacks } from "../callbacks";

export const homeKeyboard = (isAdmin: boolean): UiKeyboard => {
  const keyboard: UiKeyboard = [
    [
      { text: "🛒 فروشگاه", action: nav.shopCategories() },
      { text: "📦 اکانت‌های من", action: nav.accountDetails() },
    ],
    [
      { text: "💳 کیف پول", action: nav.wallet() },
      { text: "🆓 اکانت تست", action: nav.freeAccount() },
    ],
    [
      { text: "📘 راهنما", action: nav.productGuide() },
      { text: "🎫 پشتیبانی", action: nav.support() },
    ],
    [
      { text: "🎁 دعوت دوستان", action: nav.referral() },
      { text: "👤 حساب کاربری", action: nav.account() },
    ],
  ];
  if (isAdmin) keyboard.push([{ text: "🛡 پنل مدیریت", action: nav.adminDashboard() }]);
  return keyboard;
};

export const supportCloseHomeInlineKeyboard = (ticketId: string) => ({
  inline_keyboard: [[{ text: "✅ بستن تیکت", callback_data: supportCallbacks.close(ticketId) }], [{ text: "🏠 خانه", callback_data: nav.home() }]],
});
