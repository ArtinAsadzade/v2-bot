import { test } from "vitest";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const flowEngine = readFileSync("src/bot/flows/flow-engine.ts", "utf8");
const modernViews = (readFileSync("src/bot/views/admin.views.ts", "utf8"));
const adminService = readFileSync("src/modules/admin/admin.service.ts", "utf8");
const validation = readFileSync("src/modules/product/product.validation.ts", "utf8");

test("admin category and product edit prompts no longer expose field:value instructions", () => {
  for (const source of [flowEngine, modernViews]) {
    assert.doesNotMatch(source, /هر خط به شکل|هر خط را به شکل|field: value|active:true|name: عنوان/);
    assert.doesNotMatch(source, /هر فیلدی را که می‌خواهید تغییر کند/);
  }
});

test("guided product edit uses single-purpose field prompts and direct patch save", () => {
  for (const field of ["title", "price", "category", "trafficGB", "durationDays", "stockLimit", "limitIp", "soldCount"]) {
    assert.match(modernViews, new RegExp(`flow:start:product_edit:\\$\\{detail\\.product\\.id\\}:${field}`));
  }
  assert.match(flowEngine, /عنوان جدید محصول را ارسال کنید/);
  assert.match(flowEngine, /قیمت جدید را به تومان/);
  assert.match(flowEngine, /حجم سرویس را ارسال کنید/);
  assert.match(flowEngine, /const product = await AdminService\.updateProduct\(productId, patch/);
  assert.doesNotMatch(flowEngine, /Object\.assign\(patch/);
});

test("guided category edit has field buttons and validations", () => {
  for (const field of ["name", "description", "icon", "order"]) {
    assert.match(modernViews, new RegExp(`flow:start:category_edit:\\$\\{detail\\.category\\.id\\}:${field}`));
  }
  assert.match(flowEngine, /نام دسته‌بندی.+2, 64/);
  assert.match(flowEngine, /توضیحات.+0, 500/);
  assert.match(flowEngine, /آیکون حداکثر ۴ کاراکتر/);
  assert.match(flowEngine, /ترتیب نمایش/);
});

test("valid zero and positive xray numbers are accepted, while negatives become product validation errors", () => {
  assert.match(validation, /normalizeNumericInput/);
  assert.match(validation, /ProductValidationError/);
  assert.match(adminService, /validateNonNegativeInteger\(rest\.stockLimit/);
  assert.match(adminService, /validateNonNegativeInteger\(rest\.xrayLimitIp/);
  assert.match(adminService, /validateNonNegativeNumber\(trafficGB, MSG_TRAFFIC\)/);
  assert.match(adminService, /validateNonNegativeInteger\(durationDays, "مدت", MSG_DURATION\)/);
});

test("callback data length remains safe for product edit actions", () => {
  assert.ok("flow:start:product_edit:".length + 24 + ":durationDays".length <= 64);
  assert.ok("xpg:l:pe:".length + 32 <= 64);
  assert.ok("xpi:l:pe:".length + 32 <= 64);
});
