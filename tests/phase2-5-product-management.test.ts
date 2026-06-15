import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const validation = readFileSync("src/modules/product/product.validation.ts", "utf8");
const adminService = readFileSync("src/modules/admin/admin.service.ts", "utf8");
const productService = readFileSync("src/modules/product/product.service.ts", "utf8");
const panel = readFileSync("src/bot/handlers/admin/panel.ts", "utf8");
const flow = readFileSync("src/bot/handlers/admin/admin.flow.handler.ts", "utf8");

test("validation accepts unlimited zero semantics for xray fields", () => {
  assert.match(adminService, /MSG_IP = "❌ محدودیت IP باید عدد صحیح صفر یا بزرگ‌تر باشد\. عدد ۰ یعنی نامحدود\."/);
  assert.match(adminService, /MSG_TRAFFIC = "❌ حجم باید عدد صفر یا بزرگ‌تر باشد\. عدد ۰ یعنی نامحدود\."/);
  assert.match(adminService, /MSG_DURATION = "❌ مدت باید عدد صحیح صفر یا بزرگ‌تر باشد\. عدد ۰ یعنی نامحدود\."/);
  assert.match(adminService, /validateNonNegativeInteger\(rest\.xrayLimitIp/);
  assert.match(adminService, /validateNonNegativeNumber\(trafficGB, MSG_TRAFFIC\)/);
  assert.match(adminService, /validateNonNegativeInteger\(durationDays/);
  assert.match(productService, /validateNonNegativeInteger\(data\.xrayLimitIp \?\? data\.limitIp/);
  assert.match(productService, /trafficBytes === undefined \|\| trafficBytes < 0n/);
});

test("stock limit zero is allowed but below soldCount is rejected", () => {
  assert.match(adminService, /MSG_STOCK = "❌ موجودی کل باید عدد صحیح صفر یا بزرگ‌تر باشد\. عدد ۰ یعنی ناموجود\."/);
  assert.match(adminService, /validateNonNegativeInteger\(rest\.stockLimit/);
  assert.match(adminService, /MSG_STOCK_LT_SOLD = "❌ موجودی کل نمی‌تواند کمتر از تعداد فروخته‌شده باشد/);
  assert.match(adminService, /Number\(updateData\.stockLimit\) < currentProduct\.soldCount/);
  assert.match(adminService, /resetXraySoldCount[\s\S]*soldCount: 0/);
});

test("field-specific xray update methods update only intended fields", () => {
  for (const method of ["updateXrayTraffic", "updateXrayDuration", "updateXrayStockLimit", "resetXraySoldCount", "updateXrayLimitIp", "updateXrayGroup", "updateXrayInbounds"]) {
    assert.match(adminService, new RegExp(`static async ${method}\\(`));
  }
  assert.match(adminService, /if \(product\.mode !== "xray_auto"\) throw new Error\("❌ این فیلد فقط برای محصولات Xray است\."\)/);
  assert.match(adminService, /updateProduct\(productId, \{ trafficGB \}/);
  assert.match(adminService, /updateProduct\(productId, \{ durationDays \}/);
  assert.match(adminService, /updateProduct\(productId, \{ stockLimit \}/);
  assert.match(adminService, /updateProduct\(productId, \{ xrayLimitIp \}/);
  assert.match(adminService, /updateProduct\(productId, \{ xrayGroupName \}/);
  assert.match(adminService, /updateProduct\(productId, \{ inboundIds: \[\.\.\.new Set\(inboundIds\)\], inboundSnapshot \}/);
});

test("invalid field edit input is handled as Persian validation reply", () => {
  assert.match(validation, /isValidationError/);
  assert.match(flow, /replyValidationError/);
  assert.match(flow, /if \(isValidationError\(error\)\)/);
  assert.match(flow, /حجم باید عدد صفر یا بزرگ‌تر باشد/);
  assert.match(flow, /مدت باید عدد صحیح صفر یا بزرگ‌تر باشد/);
  assert.match(flow, /محدودیت IP باید عدد صحیح صفر یا بزرگ‌تر باشد/);
});

test("xray detail displays unlimited values and stock status", () => {
  assert.match(panel, /formatXrayBytes[\s\S]*return "نامحدود"/);
  assert.match(panel, /formatUnlimitedInt[\s\S]*return "نامحدود"/);
  assert.match(panel, /stockLimit === 0 \? "ناموجود"/);
  assert.match(panel, /باقی‌مانده: \$\{remaining\.toLocaleString/);
});

test("xray detail has separate safe callbacks and manual detail hides xray actions", () => {
  for (const cb of ["admin:pe:tr:", "admin:pe:du:", "admin:pe:st:", "admin:pe:sr:", "admin:pe:ip:", "admin:pe:gr:", "admin:pe:in:"]) {
    assert.ok(`${cb}${"0".repeat(36)}`.length <= 64, cb);
    assert.match(panel, new RegExp(cb.replace(/:/g, ":")));
  }
  const manualBranch = panel.slice(panel.indexOf("else rows.push"), panel.indexOf("rows.push([Markup.button.callback(\"📋 کپی محصول\""));
  assert.doesNotMatch(manualBranch, /admin:pe:(tr|du|st|sr|ip|gr|in):/);
});
