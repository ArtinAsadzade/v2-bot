import { readFileSync } from "node:fs";
import { test } from "vitest";
import assert from "node:assert/strict";
import { readAdminViewsSource } from "./helpers/view-source";

const schema = readFileSync("prisma/schema.prisma", "utf8");
const xrayService = readFileSync("src/modules/xray/xray.service.ts", "utf8");
const flow = readFileSync("src/bot/flows/flow-engine.ts", "utf8");
const payment = (readFileSync("src/modules/payment/payment.service.ts", "utf8") + "\n" + readFileSync("src/modules/payment/payment.types.ts", "utf8") + "\n" + readFileSync("src/modules/payment/payment-fulfillment.service.ts", "utf8") + "\n" + readFileSync("src/modules/payment/payment-delivery.service.ts", "utf8") + "\n" + readFileSync("src/modules/payment/payment-callback.service.ts", "utf8") + "\n" + readFileSync("src/modules/payment/wallet-payment.service.ts", "utf8") + "\n" + readFileSync("src/modules/payment/gateway-payment.service.ts", "utf8") + "\n" + readFileSync("src/modules/payment/payment-discount.service.ts", "utf8") + "\n" + readFileSync("src/modules/payment/payment-notification.service.ts", "utf8") + "\n" + readFileSync("src/modules/payment/payment-repository.ts", "utf8"));
const product = readFileSync("src/modules/product/product.service.ts", "utf8");
const views = (readFileSync("src/bot/views/modern.views.ts", "utf8") + "\n" + readFileSync("src/bot/views/home.views.ts", "utf8") + "\n" + readFileSync("src/bot/views/product.views.ts", "utf8") + "\n" + readFileSync("src/bot/views/purchase.views.ts", "utf8") + "\n" + readFileSync("src/bot/views/account.views.ts", "utf8") + "\n" + readFileSync("src/bot/views/wallet.views.ts", "utf8") + "\n" + readFileSync("src/bot/views/support.views.ts", "utf8") + "\n" + readFileSync("src/bot/views/free-account.views.ts", "utf8") + "\n" + readAdminViewsSource());

test("xray products and clients persist IP limit and group metadata", () => {
  assert.match(schema, /xrayLimitIp\s+Int\s+@default\(0\)/);
  assert.match(schema, /xrayGroupName\s+String\?/);
  assert.match(schema, /limitIp\s+Int\s+@default\(0\)/);
  assert.match(schema, /groupName\s+String\?/);
});

test("product creation asks for limitIp, fetches groups, and saves both settings", () => {
  assert.match(flow, /🌐 محدودیت IP را وارد کنید/);
  assert.match(flow, /۰ یعنی بدون محدودیت/);
  assert.match(flow, /XrayClientService\.listGroups\(\)/);
  assert.match(flow, /👥 انتخاب گروه کلاینت/);
  assert.match(flow, /limitIp: Number\(flow\.data\.limitIp \?\? 0\)/);
  assert.match(flow, /xrayGroupName: groupName/);
  assert.match(product, /const limitIp = data\.xrayLimitIp \?\? Math\.max\(0, Number\(data\.limitIp \?\? 0\)\)/);
  assert.match(product, /xrayLimitIp: limitIp/);
});

test("client creation and renewal send product IP limit and group to 3x-ui", () => {
  assert.match(xrayService, /\/panel\/api\/clients\/groups/);
  assert.match(xrayService, /limitIp: Math\.max\(0, Number\(input\.limitIp \?\? 0\)\)/);
  assert.match(xrayService, /if \(input\.groupName\) client\.group = input\.groupName/);
  assert.match(payment, /limitIp: product\.xrayLimitIp \?\? 0/);
  assert.match(payment, /groupName: product\.xrayGroupName/);
  assert.match(payment, /XrayClientService\.updateClient\(renewal\.xrayClient\.clientEmail/);
});

test("renewal list and missing panel sync stay xray-specific", () => {
  assert.match(product, /mode: "xray_auto" as const/);
  assert.match(product, /trafficBytes: \{ gt: 0n \}/);
  assert.doesNotMatch(product.match(/private static renewalProductWhere[\s\S]*?static async listRenewalCategories/)?.[0] ?? "", /ProductAccount|accounts/);
  assert.match(xrayService, /XRAY_CLIENT_MISSING_ON_PANEL/);
  assert.match(views, /missing_on_panel/);
});
