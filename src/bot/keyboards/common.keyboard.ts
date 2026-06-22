import type { UiKeyboard } from "../navigation/panel-ui";
import { nav, supportCallbacks } from "../callbacks";
import { adminLabels, userLabels } from "../ui/labels";

export const homeKeyboard = (isAdmin: boolean): UiKeyboard => {
  const keyboard: UiKeyboard = [
    [
      { text: "🎁 تست", action: nav.freeAccount() },
      { text: "🛍 محصولات", action: nav.shopCategories() },
    ],
    [
      { text: userLabels.myAccounts, action: nav.account() },
      { text: "🤝 دعوت", action: nav.referral() },
    ],
    [
      { text: userLabels.support, action: nav.support() },
      { text: userLabels.guide, action: nav.productGuide() },
    ],
  ];
  if (isAdmin) keyboard.push([{ text: "🛠 پنل مدیریت", action: nav.adminDashboard() }]);
  return keyboard;
};

export const supportCloseHomeInlineKeyboard = (ticketId: string) => ({
  inline_keyboard: [[{ text: "✅ بستن تیکت", callback_data: supportCallbacks.close(ticketId) }], [{ text: "🏠 خانه", callback_data: nav.home() }]],
});
