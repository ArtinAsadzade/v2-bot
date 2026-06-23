import { test } from "vitest";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readAdminViewsSource } from "./helpers/view-source";

const productServiceSource = readFileSync("src/modules/product/product.service.ts", "utf8");
const modernViewsSource = (readFileSync("src/bot/views/modern.views.ts", "utf8") + "\n" + readFileSync("src/bot/views/home.views.ts", "utf8") + "\n" + readFileSync("src/bot/views/product.views.ts", "utf8") + "\n" + readFileSync("src/bot/views/purchase.views.ts", "utf8") + "\n" + readFileSync("src/bot/views/account.views.ts", "utf8") + "\n" + readFileSync("src/bot/views/wallet.views.ts", "utf8") + "\n" + readFileSync("src/bot/views/support.views.ts", "utf8") + "\n" + readFileSync("src/bot/views/free-account.views.ts", "utf8") + "\n" + readAdminViewsSource());
const legacyShopSource = readFileSync("src/bot/handlers/shop.ts", "utf8");

const renewalStart = modernViewsSource.match(/const renderRenewService[\s\S]*?registerView\("account\.renew", renderRenewService\)/)?.[0] ?? "";
const renewalProducts = modernViewsSource.match(/registerView\("account\.renew\.products"[\s\S]*?registerView\("account\.renew\.summary"/)?.[0] ?? "";
const renewalSummary = modernViewsSource.match(/registerView\("account\.renew\.summary"[\s\S]*?registerView\("account\.history"/)?.[0] ?? "";
const shopProducts = modernViewsSource.match(/registerView\("shop\.products"[\s\S]*?registerView\("shop\.searchResults"/)?.[0] ?? "";
const productDetail = modernViewsSource.match(/registerView\("shop\.product"[\s\S]*?registerView\("shop\.checkout"/)?.[0] ?? "";

test("renewal categories query is xray_auto active stock-limited without manual ProductAccount availability", () => {
  assert.match(productServiceSource, /static async listRenewalCategories/);
  assert.match(productServiceSource, /mode: "xray_auto"/);
  assert.match(productServiceSource, /isActive: true/);
  assert.match(productServiceSource, /deletedAt: null/);
  assert.match(productServiceSource, /stockLimit: \{ gt: 0 \}/);
  assert.match(productServiceSource, /trafficBytes: \{ gt: 0n \}/);
  assert.match(productServiceSource, /durationDays: \{ gt: 0 \}/);
  assert.match(productServiceSource, /product\.stockLimit > product\.soldCount/);
  assert.doesNotMatch(productServiceSource.match(/static async listRenewalCategories[\s\S]*?static async listRenewalProductsByCategory/)?.[0] ?? "", /availableInventoryWhere|accounts/);
});

test("renewal start shows current product title and never returns an empty page", () => {
  assert.match(renewalStart, /include: \{ product: true, order: true, user: true \}/);
  assert.match(renewalStart, /const currentProductTitle = client\.product\?\.title \?\? "سرویس Xray"/);
  assert.match(renewalStart, /ProductService\.listRenewalCategories\(client\.id, client\.productId\)/);
  assert.match(renewalStart, /در حال حاضر پلنی برای تمدید موجود نیست/);
  assert.match(renewalStart, /🛒 فروشگاه/);
  assert.match(renewalStart, /🎫 پشتیبانی/);
  assert.match(renewalStart, /🔙 بازگشت/);
});

test("renewal category and product buttons preserve context and use clean labels", () => {
  assert.match(renewalStart, /text: `📂 \$\{category\.name\}`/);
  assert.match(renewalStart, /callbackFor\("account\.renew\.products", \{ xrayClientId: client\.id, categoryId: category\.id \}\)/);
  assert.match(renewalProducts, /ProductService\.listRenewalProductsByCategory\(params\.categoryId, client\.id, client\.productId\)/);
  assert.match(renewalProducts, /text: p\.title, action: tokenAction\("xr:r:s", createCallbackToken\(ctx, "renewal", \{ xrayClientId: client\.id, productId: p\.id \}\)\)/);
  assert.doesNotMatch(renewalProducts, /formatXrayBytes\(p\.trafficBytes\)|money\(p\.price\)|موجودی|روز ·/);
});

test("renewal summary contains full selected plan details", () => {
  assert.match(renewalSummary, /🔄 خلاصه تمدید/);
  assert.match(renewalSummary, /📦 سرویس فعلی:/);
  assert.match(renewalSummary, /➕ پلن تمدید:/);
  assert.match(renewalSummary, /📊 حجم اضافه:/);
  assert.match(renewalSummary, /📅 مدت اضافه:/);
  assert.match(renewalSummary, /💰 مبلغ:/);
});

test("user-facing shop product selection buttons show only product title", () => {
  assert.match(shopProducts, /text: product\.title/);
  assert.doesNotMatch(shopProducts, /money\(product\.price\)|stockLabel|formatXrayBytes|durationDays|availableStock/);
  assert.match(legacyShopSource, /Markup\.button\.callback\(product\.title, `product:\$\{product\.id\}`\)/);
  assert.doesNotMatch(legacyShopSource.match(/bot\.action\(\/\^cat:[\s\S]*?bot\.action\(\/\^product:/)?.[0] ?? "", /price|availableStock|duration|traffic|موجودی|تومان/);
});

test("product detail still shows full details after clean list labels", () => {
  assert.match(productDetail, /💰 قیمت نهایی/);
  assert.match(productDetail, /📊 موجودی/);
  assert.match(productDetail, /📅 اعتبار سرویس/);
  assert.match(productDetail, /📊 حجم/);
});
