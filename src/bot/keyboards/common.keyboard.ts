import type { UiKeyboard } from "../navigation/panel-ui";
import { nav, supportCallbacks } from "../callbacks";
import { adminLabels, userLabels } from "../ui/labels";

export const homeKeyboard = (isAdmin: boolean): UiKeyboard => {
  const keyboard: UiKeyboard = [
    [
      { text: userLabels.buyService, action: nav.shopCategories() },
      { text: userLabels.freeAccount, action: nav.freeAccount() },
    ],
    [
      { text: userLabels.myServices, action: nav.accountDetails() },
      { text: userLabels.renewService, action: nav.renewService() },
    ],
    [
      { text: userLabels.myAccounts, action: nav.account() },
      { text: userLabels.wallet, action: nav.wallet() },
    ],
    [
      { text: userLabels.support, action: nav.support() },
      { text: "📢 اطلاعیه‌ها", action: nav.referral() },
    ],
    [{ text: userLabels.guide, action: nav.productGuide() }],
  ];
  if (isAdmin) keyboard.push([{ text: "🛠 پنل مدیریت", action: nav.adminDashboard() }]);
  return keyboard;
};

export const supportCloseHomeInlineKeyboard = (ticketId: string) => ({
  inline_keyboard: [[{ text: "✅ بستن تیکت", callback_data: supportCallbacks.close(ticketId) }], [{ text: "🏠 خانه", callback_data: nav.home() }]],
});
