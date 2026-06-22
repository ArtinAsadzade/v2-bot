import type { UiKeyboard } from "../navigation/panel-ui";
import { nav, supportCallbacks } from "../callbacks";
import { adminLabels, userLabels } from "../ui/labels";

export const homeKeyboard = (isAdmin: boolean): UiKeyboard => {
  const keyboard: UiKeyboard = [
    [
      { text: userLabels.buyService, action: nav.shopCategories() },
      { text: userLabels.myAccounts, action: nav.accountDetails() },
    ],
    [
      { text: userLabels.wallet, action: nav.wallet() },
      { text: userLabels.coupon, action: nav.shopCategories() },
    ],
    [
      { text: userLabels.support, action: nav.support() },
      { text: userLabels.guide, action: nav.productGuide() },
    ],
    [
      { text: "🎁 دعوت دوستان", action: nav.referral() },
      { text: "👤 حساب کاربری", action: nav.account() },
    ],
  ];
  if (isAdmin) keyboard.push([{ text: adminLabels.dashboard, action: nav.adminDashboard() }]);
  return keyboard;
};

export const supportCloseHomeInlineKeyboard = (ticketId: string) => ({
  inline_keyboard: [[{ text: "✅ بستن تیکت", callback_data: supportCallbacks.close(ticketId) }], [{ text: "🏠 خانه", callback_data: nav.home() }]],
});
