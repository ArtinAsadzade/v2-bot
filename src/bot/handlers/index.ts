import type { AppBot } from "../../types/bot";
import { registerStartHandlers } from "./start";
import { registerWalletHandlers } from "./wallet";
import { registerShopHandlers } from "./shop";
import { registerDepositHandlers } from "./deposit/start";
import { registerSupportHandlers } from "./support/start";
import { registerAdminHandlers } from "./admin/panel";
import { registerReferralHandlers } from "./referral";
import { registerFreeConfigHandlers } from "./free-config";

export function registerHandlers(bot: AppBot) {
  registerStartHandlers(bot);
  registerWalletHandlers(bot);
  registerShopHandlers(bot);
  registerDepositHandlers(bot);
  registerSupportHandlers(bot);
  registerReferralHandlers(bot);
  registerFreeConfigHandlers(bot);
  registerAdminHandlers(bot);
}
