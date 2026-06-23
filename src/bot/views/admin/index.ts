import { registerAdminXrayViews } from "./admin-xray.views";
import { registerAdminXrayPanelViews } from "./admin-xray-panels.views";
import { registerAdminXraySyncViews } from "./admin-xray-sync.views";
import { registerAdminDashboardViews } from "./admin-dashboard.views";
import { registerAdminUserViews } from "./admin-users.views";
import { registerAdminProductViews } from "./admin-products.views";
import { registerAdminCategoryViews } from "./admin-categories.views";
import { registerAdminWalletViews } from "./admin-wallets.views";
import { registerAdminReferralViews } from "./admin-referrals.views";
import { registerAdminCouponViews } from "./admin-coupons.views";
import { registerAdminBroadcastViews } from "./admin-broadcast.views";
import { registerAdminSettingsViews } from "./admin-settings.views";
import { registerAdminPaymentViews } from "./admin-payments.views";
import { registerAdminSupportViews } from "./admin-support.views";

export function registerAdminViews() {
  registerAdminXrayViews();
  registerAdminXrayPanelViews();
  registerAdminXraySyncViews();
  registerAdminDashboardViews();
  registerAdminUserViews();
  registerAdminProductViews();
  registerAdminCategoryViews();
  registerAdminWalletViews();
  registerAdminReferralViews();
  registerAdminCouponViews();
  registerAdminBroadcastViews();
  registerAdminSettingsViews();
  registerAdminPaymentViews();
  registerAdminSupportViews();
}
