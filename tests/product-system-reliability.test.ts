import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const productService = readFileSync("src/modules/product/product.service.ts", "utf8");
const adminService = readFileSync("src/modules/admin/admin.service.ts", "utf8");
const modernViews = readFileSync("src/bot/views/modern.views.ts", "utf8");
const flowEngine = readFileSync("src/bot/flows/flow-engine.ts", "utf8");
const modernHandlers = readFileSync("src/bot/handlers/modern.ts", "utf8");

test("product create requires explicit mode and rejects incomplete Xray products", () => {
  assert.match(productService, /mode: "manual_inventory" \| "xray_auto"/);
  assert.match(productService, /data\.mode === "xray_auto"/);
  assert.match(productService, /حداقل یک اینباند لازم است/);
  assert.match(productService, /حجم محصول Xray باید بیشتر از صفر باشد/);
  assert.match(productService, /مدت محصول Xray باید بیشتر از صفر باشد/);
  assert.match(productService, /موجودی محصول Xray باید صفر یا بیشتر باشد/);
  assert.match(productService, /mode: "manual_inventory"/);
  assert.match(productService, /inboundIds: \[\]/);
});

test("Xray creation stores durationDays explicitly", () => {
  assert.match(productService, /durationDays = data\.durationDays \?\? data\.duration/);
  assert.match(productService, /duration: durationDays, durationDays, mode: "xray_auto"/);
  assert.match(flowEngine, /mode: "xray_auto"/);
  assert.match(flowEngine, /durationDays: duration/);
  assert.match(modernHandlers, /durationDays: Number\(flow\.data\.durationDays \?\? flow\.data\.duration\)/);
});

test("Xray edit buttons are field-specific and manual detail stays manual-only", () => {
  for (const field of ["title", "price", "category", "trafficGB", "durationDays", "stockLimit", "limitIp"]) {
    assert.match(modernViews, new RegExp(`flow:start:product_edit:\\$\\{detail\\.product\\.id\\}:${field}`));
  }
  assert.match(modernViews, /xpg:l:pe/);
  assert.match(modernViews, /xpi:l:pe/);
  const manualSection = modernViews.slice(modernViews.indexOf('مدت: ${detail.product.duration'), modernViews.indexOf('registerView("admin.categories"'));
  assert.doesNotMatch(manualSection, /trafficGB|durationDays|xpg:l:pe|xpi:l:pe|کلاینت‌های ساخته‌شده/);
  assert.match(manualSection, /افزودن اکانت/);
});

test("field-specific product edit rejects invalid or manual-only Xray fields", () => {
  assert.match(flowEngine, /validFields = new Set\(\["title", "price", "category", "trafficGB", "durationDays", "stockLimit", "limitIp"\]\)/);
  assert.match(flowEngine, /فیلد ویرایش معتبر نیست/);
  assert.match(flowEngine, /این فیلد فقط برای محصولات Xray است/);
});

test("service validates Xray update fields and active category assignment", () => {
  assert.match(adminService, /trafficGB !== undefined && trafficGB <= 0/);
  assert.match(adminService, /durationDays !== undefined && durationDays <= 0/);
  assert.match(adminService, /Number\(updateData\.stockLimit\) < currentProduct\.soldCount/);
  assert.match(adminService, /Number\(updateData\.stockLimit\) < 0/);
  assert.match(adminService, /updateData\.inboundIds !== undefined && !\(updateData\.inboundIds as number\[\]\)\.length/);
  assert.match(adminService, /AND: \[activeCategoryWhere\(\)\]/);
});

test("duplicateProduct preserves Xray configuration and resets runtime counters", () => {
  assert.match(adminService, /mode: source\.mode/);
  for (const field of ["durationDays", "trafficBytes", "stockLimit", "xrayLimitIp", "xrayGroupName", "inboundIds", "inboundSnapshot"]) {
    assert.match(adminService, new RegExp(`${field}: source\\.mode === "xray_auto" \\? source\\.${field}`));
  }
  assert.match(adminService, /soldCount: 0/);
  assert.match(adminService, /isActive: false/);
  assert.match(adminService, /deletedAt: null/);
});

test("user product detail uses active product getter and Xray stock never falls back to manual accounts", () => {
  assert.match(productService, /getActiveProductForUser/);
  assert.match(productService, /category: \{ is: activeCategoryWhere\(\) \}/);
  assert.match(modernViews, /ProductService\.getActiveProductForUser\(params\.productId\)/);
  assert.match(productService, /if \(product\?\.mode === "xray_auto"\) return Math\.max\(\(product\.stockLimit \?\? 0\) - product\.soldCount, 0\)/);
});
