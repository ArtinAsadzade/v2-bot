import { registerHomeViews } from "./home.views";
import { registerProductViews } from "./product.views";
import { registerPurchaseViews } from "./purchase.views";
import { registerAccountViews } from "./account.views";
import { registerWalletViews } from "./wallet.views";
import { registerSupportViews } from "./support.views";
import { registerFreeAccountViews } from "./free-account.views";
import { registerAdminViews } from "./admin.views";
import { registerPredictionViews } from "./prediction.views";

export function registerModernViews() {
  registerHomeViews();
  registerProductViews();
  registerPurchaseViews();
  registerAccountViews();
  registerWalletViews();
  registerSupportViews();
  registerFreeAccountViews();
  registerPredictionViews();
  registerAdminViews();
}

export * from "./home.views";
export * from "./product.views";
export * from "./purchase.views";
export * from "./account.views";
export * from "./wallet.views";
export * from "./support.views";
export * from "./free-account.views";
export * from "./admin.views";
export * from "./prediction.views";
