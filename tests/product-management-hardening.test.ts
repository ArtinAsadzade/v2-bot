import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "vitest";

const productService = readFileSync("src/modules/product/product.service.ts", "utf8");
const adminService = readFileSync("src/modules/admin/admin.service.ts", "utf8");
const validation = readFileSync("src/modules/product/product.validation.ts", "utf8");

test("product validation centralizes required names and positive integers", () => {
  assert.match(validation, /validateProductName/);
  assert.match(validation, /trim\(\)/);
  assert.match(validation, /validatePositiveInteger/);
  assert.match(validation, /Number\.isInteger/);
  assert.match(validation, /number <= 0/);
});

test("product create is transactional and duplicate-protected by name category and mode", () => {
  assert.match(productService, /prisma\.\$transaction/);
  assert.match(productService, /title, categoryId: category\.id, mode: data\.mode/);
  assert.match(productService, /محصولی با همین نام، دسته‌بندی و نوع/);
  assert.match(productService, /action: "product\.created"/);
});

test("product update is transactional, update-only, duplicate-protected, and field-audited", () => {
  assert.match(adminService, /prisma\.\$transaction/);
  assert.match(adminService, /tx\.product\.findUnique/);
  assert.match(adminService, /tx\.product\.update/);
  assert.doesNotMatch(adminService.match(/static async updateProduct[\s\S]*?static async setProductActive/)?.[0] ?? "", /product\.create/);
  assert.match(adminService, /id: \{ not: productId \}/);
  assert.match(adminService, /fieldChanged/);
  assert.match(adminService, /oldValue/);
  assert.match(adminService, /newValue/);
});
