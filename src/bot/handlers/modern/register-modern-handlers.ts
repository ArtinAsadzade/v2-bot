import type { AppBot } from "../../../types/bot";
import { registerFlowEngine } from "../../flows/flow-engine";
import { registerModernViews } from "../../views/modern.views";
import { registerNavigationHandlers } from "./navigation.handlers";
import { registerHomeHandlers } from "./home.handlers";
import { registerProductHandlers } from "./product.handlers";
import { registerXrayHandlers } from "./xray.handlers";
import { registerCouponHandlers } from "./coupon.handlers";
import { registerPurchaseHandlers } from "./purchase.handlers";
import { registerWalletHandlers } from "./wallet.handlers";
import { registerFreeAccountHandlers } from "./free-account.handlers";
import { registerSupportHandlers } from "./support.handlers";
import { registerAdminHandlers } from "./admin.handlers";

export function registerModernHandlers(bot: AppBot) {
  registerModernViews();
  registerFlowEngine(bot);

  registerNavigationHandlers(bot);
  registerHomeHandlers(bot);
  registerProductHandlers(bot);
  registerXrayHandlers(bot);
  registerCouponHandlers(bot);
  registerPurchaseHandlers(bot);
  registerWalletHandlers(bot);
  registerFreeAccountHandlers(bot);
  registerSupportHandlers(bot);
  registerAdminHandlers(bot);
}
