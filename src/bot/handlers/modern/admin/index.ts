import type { AppBot } from "../../../../types/bot";
import { registerAdminInventoryHandlers } from "./admin-inventory.handlers";
import { registerAdminSettingsHandlers } from "./admin-settings.handlers";
import { registerAdminProductsHandlers } from "./admin-products.handlers";
import { registerAdminPaymentsHandlers } from "./admin-payments.handlers";
import { registerAdminCouponsHandlers } from "./admin-coupons.handlers";
import { registerAdminUsersHandlers } from "./admin-users.handlers";
import { registerAdminSupportHandlers } from "./admin-support.handlers";
import { registerAdminXrayHandlers } from "./admin-xray.handlers";

export function registerAdminDomainHandlers(bot: AppBot) {
  registerAdminInventoryHandlers(bot);
  registerAdminSettingsHandlers(bot);
  registerAdminProductsHandlers(bot);
  registerAdminPaymentsHandlers(bot);
  registerAdminCouponsHandlers(bot);
  registerAdminUsersHandlers(bot);
  registerAdminSupportHandlers(bot);
  registerAdminXrayHandlers(bot);
}
