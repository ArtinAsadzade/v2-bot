import { test } from "vitest";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readAdminViewsSource } from "./helpers/view-source";

const modernViewsSource = (readFileSync("src/bot/views/modern.views.ts", "utf8") + "\n" + readFileSync("src/bot/views/home.views.ts", "utf8") + "\n" + readFileSync("src/bot/views/product.views.ts", "utf8") + "\n" + readFileSync("src/bot/views/purchase.views.ts", "utf8") + "\n" + readFileSync("src/bot/views/account.views.ts", "utf8") + "\n" + readFileSync("src/bot/views/wallet.views.ts", "utf8") + "\n" + readFileSync("src/bot/views/support.views.ts", "utf8") + "\n" + readFileSync("src/bot/views/free-account.views.ts", "utf8") + "\n" + readAdminViewsSource());
const modernHandlersSource = (readFileSync("src/bot/handlers/modern/register-modern-handlers.ts", "utf8") + "\n" + readFileSync("src/bot/handlers/modern/navigation.handlers.ts", "utf8") + "\n" + readFileSync("src/bot/handlers/modern/home.handlers.ts", "utf8") + "\n" + readFileSync("src/bot/handlers/modern/product.handlers.ts", "utf8") + "\n" + readFileSync("src/bot/handlers/modern/purchase.handlers.ts", "utf8") + "\n" + readFileSync("src/bot/handlers/modern/wallet.handlers.ts", "utf8") + "\n" + readFileSync("src/bot/handlers/modern/coupon.handlers.ts", "utf8") + "\n" + readFileSync("src/bot/handlers/modern/account.handlers.ts", "utf8") + "\n" + readFileSync("src/bot/handlers/modern/xray.handlers.ts", "utf8") + "\n" + readFileSync("src/bot/handlers/modern/free-account.handlers.ts", "utf8") + "\n" + readFileSync("src/bot/handlers/modern/support.handlers.ts", "utf8") + "\n" + readFileSync("src/bot/handlers/modern/admin.handlers.ts", "utf8") + "\n" + readFileSync("src/bot/handlers/modern/admin/index.ts", "utf8") + "\n" + readFileSync("src/bot/handlers/modern/admin/admin-products.handlers.ts", "utf8") + "\n" + readFileSync("src/bot/handlers/modern/admin/admin-payments.handlers.ts", "utf8") + "\n" + readFileSync("src/bot/handlers/modern/admin/admin-coupons.handlers.ts", "utf8") + "\n" + readFileSync("src/bot/handlers/modern/admin/admin-inventory.handlers.ts", "utf8") + "\n" + readFileSync("src/bot/handlers/modern/admin/admin-settings.handlers.ts", "utf8") + "\n" + readFileSync("src/bot/handlers/modern/admin/admin-support.handlers.ts", "utf8") + "\n" + readFileSync("src/bot/handlers/modern/admin/admin-users.handlers.ts", "utf8") + "\n" + readFileSync("src/bot/keyboards/purchase.keyboard.ts", "utf8") + "\n" + readFileSync("src/bot/messages/coupon.messages.ts", "utf8") + "\n" + readFileSync("src/bot/messages/purchase.messages.ts", "utf8") + "\n" + readFileSync("src/bot/callbacks/index.ts", "utf8"));
const flowEngineSource = readFileSync("src/bot/flows/flow-engine.ts", "utf8");
const panelUiSource = readFileSync("src/bot/navigation/panel-ui.ts", "utf8");

test("checkout with coupon renders dedicated remove and change buttons with product context", () => {
  assert.match(modernViewsSource, /actionFor\("coupon:remove", product\.id\)/);
  assert.match(modernViewsSource, /actionFor\("coupon:change", product\.id\)/);
  assert.match(modernViewsSource, /تغییر کد تخفیف/);
});

test("remove coupon callback clears session coupon and re-renders checkout without usage mutation", () => {
  assert.match(modernHandlersSource, /bot\.action\(\/\^coupon:remove:\(\.\+\)\$\//);
  assert.match(modernHandlersSource, /delete ctx\.session\.selectedCoupons\[productId\]/);
  assert.match(modernHandlersSource, /✅ کد تخفیف از فاکتور حذف شد/);
  assert.match(modernHandlersSource, /id: "shop\.checkout", params: \{ productId \}/);
  assert.doesNotMatch(modernHandlersSource, /couponUsage\.(create|delete|update)/);
  assert.doesNotMatch(modernHandlersSource, /usedCount/);
});

test("change coupon callback enters coupon input flow after clearing old product coupon", () => {
  assert.match(modernHandlersSource, /bot\.action\(\/\^coupon:change:\(\.\+\)\$\//);
  assert.match(modernHandlersSource, /delete ctx\.session\.selectedCoupons\[productId\]/);
  assert.match(modernHandlersSource, /startFlow\(ctx, "coupon_code", \{ productId \}\)/);
  assert.match(flowEngineSource, /validateForCheckout\(\{\s*code: text\.trim\(\),\s*userId: user\.id,\s*originalAmount: product\.price/s);
});

test("checkout has one manual Back button and disables automatic Back and Home injection", () => {
  const checkoutSection = modernViewsSource.match(/registerView\("shop\.checkout"[\s\S]*?registerView\("account"/)?.[0] ?? "";
  assert.equal((checkoutSection.match(/🔙 بازگشت/g) ?? []).length, 1);
  assert.match(checkoutSection, /navigation: \{ back: false, home: false \}/);
  assert.match(panelUiSource, /result\.navigation\?\.back \?\? !isHome/);
  assert.match(panelUiSource, /result\.navigation\?\.home \?\? !isHome/);
});

test("expired checkout coupon actions show recovery message instead of generic panel error", () => {
  assert.match(modernHandlersSource, /showExpiredCheckoutRecovery/);
  assert.match(modernHandlersSource, /این پیش‌فاکتور منقضی شده است/);
  assert.match(modernHandlersSource, /بازگشت به فروشگاه/);
  assert.doesNotMatch(modernHandlersSource.match(/bot\.action\(\/\^coupon:remove[\s\S]*?\n  \}\);/)?.[0] ?? "", /نمایش این بخش ممکن نیست/);
});

test("coupon remove works through shared checkout for Xray and manual products", () => {
  assert.match(modernViewsSource, /product\.mode === "xray_auto"/);
  assert.match(modernHandlersSource, /ProductService\.getProduct\(productId\)/);
  assert.match(modernHandlersSource, /renderPanel\(\s*ctx,\s*\{ id: "shop\.checkout", params: \{ productId \} \}/s);
});
