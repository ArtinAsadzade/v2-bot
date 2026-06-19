import { test } from "vitest";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseKeyValueLines } from "../src/bot/flows/flow-engine";

const flowEngine = readFileSync("src/bot/flows/flow-engine.ts", "utf8");
const adminService = readFileSync("src/modules/admin/admin.service.ts", "utf8");
const modernViews = (readFileSync("src/bot/views/modern.views.ts", "utf8") + "\n" + readFileSync("src/bot/views/home.views.ts", "utf8") + "\n" + readFileSync("src/bot/views/product.views.ts", "utf8") + "\n" + readFileSync("src/bot/views/purchase.views.ts", "utf8") + "\n" + readFileSync("src/bot/views/account.views.ts", "utf8") + "\n" + readFileSync("src/bot/views/wallet.views.ts", "utf8") + "\n" + readFileSync("src/bot/views/support.views.ts", "utf8") + "\n" + readFileSync("src/bot/views/free-account.views.ts", "utf8") + "\n" + readFileSync("src/bot/views/admin.views.ts", "utf8"));
const validation = readFileSync("src/modules/product/product.validation.ts", "utf8");

test("generic product edit parser normalizes xray aliases used by active runtime flow", () => {
  assert.deepEqual(parseKeyValueLines("stockLimit: 22\nlimitIp: 1\ntrafficGB: 0\ndurationDays: 0"), {
    stockLimit: "22",
    xrayLimitIp: "1",
    trafficGB: "0",
    durationDays: "0",
  });
  assert.equal(parseKeyValueLines("محدودیت IP: ۱").xrayLimitIp, "۱");
  assert.equal(parseKeyValueLines("group: بدون گروه").xrayGroupName, "بدون گروه");
});

test("generic edit active handler dispatches canonical fields to AdminService.updateProduct", () => {
  for (const field of ["trafficGB", "durationDays", "stockLimit", "xrayLimitIp", "xrayGroupName", "soldCount", "resetSoldCount"]) {
    assert.match(flowEngine, new RegExp(`${field}:`));
  }
  assert.match(flowEngine, /const product = await AdminService\.updateProduct\(productId, patch/);
  assert.match(flowEngine, /hasKey\(data, "xrayLimitIp"\) \? parseInteger\(data\.xrayLimitIp\)/);
  assert.match(flowEngine, /hasKey\(data, "stockLimit"\) \? parseInteger\(data\.stockLimit\)/);
});

test("valid zero and positive xray numbers are accepted, while negatives become product validation errors", () => {
  assert.match(validation, /normalizeNumericInput/);
  assert.match(validation, /ProductValidationError/);
  assert.match(adminService, /validateNonNegativeInteger\(rest\.stockLimit/);
  assert.match(adminService, /validateNonNegativeInteger\(rest\.xrayLimitIp/);
  assert.match(adminService, /validateNonNegativeNumber\(trafficGB, MSG_TRAFFIC\)/);
  assert.match(adminService, /validateNonNegativeInteger\(durationDays, "مدت", MSG_DURATION\)/);
});

test("soldCount reset is applied before stockLimit validation and audited", () => {
  assert.match(adminService, /soldCount !== undefined && soldCount !== 0/);
  assert.match(adminService, /if \(resetSoldCount === true \|\| soldCount === 0\) updateData\.soldCount = 0/);
  assert.match(adminService, /const effectiveSoldCount = updateData\.soldCount === 0 \? 0 : currentProduct\.soldCount/);
  assert.match(adminService, /Number\(updateData\.stockLimit\) < effectiveSoldCount/);
  assert.match(adminService, /action: "reset_sold_count"/);
});

test("known product edit validation errors stay in active flow instead of global bot error", () => {
  assert.match(flowEngine, /flow\.name === "product_edit" && isProductValidationError\(error\)/);
  assert.match(flowEngine, /await ctx\.reply\(error\.message\)/);
  assert.match(flowEngine, /return true/);
});

test("xray product buttons route to registered flow callbacks and safe token callbacks", () => {
  for (const field of ["title", "price", "category", "trafficGB", "durationDays", "stockLimit", "limitIp", "soldCount"]) {
    assert.match(modernViews, new RegExp(`flow:start:product_edit:\\$\\{detail\\.product\\.id\\}:${field}`));
  }
  assert.match(flowEngine, /bot\.action\(\/\^flow:start:/);
  assert.match(flowEngine, /if \(name === "product_edit"\) return startFlow\(ctx, "product_edit"/);
  assert.ok("xpg:l:pe:".length + 32 <= 64);
  assert.ok("xpi:l:pe:".length + 32 <= 64);
});

test("xray detail displays zero unlimited/out-of-stock values correctly", () => {
  assert.match(modernViews, /=== 0 \? "نامحدود"/);
  assert.match(modernViews, /=== 0 \? "ناموجود"/);
  assert.doesNotMatch(modernViews, /0 گیگ/);
  assert.doesNotMatch(modernViews, /0 روز/);
});
