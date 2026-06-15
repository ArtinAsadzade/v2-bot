import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const modernViewsSource = readFileSync("src/bot/views/modern.views.ts", "utf8");
const modernHandlersSource = readFileSync("src/bot/handlers/modern.ts", "utf8");
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
