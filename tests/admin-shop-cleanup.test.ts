import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { test } from "vitest";
import { callbackFor, isValidCallbackData } from "../src/bot/navigation/panel-ui";

const adminViews = readFileSync("src/bot/views/admin.views.ts", "utf8");
const storeView = adminViews.match(/registerView\("admin\.store"[\s\S]*?registerView\("admin\.finance"/)?.[0] ?? "";
const productsView = adminViews.match(/registerView\("admin\.products"[\s\S]*?registerView\("admin\.product"/)?.[0] ?? "";
const categoriesView = adminViews.match(/registerView\("admin\.categories"[\s\S]*?registerView\("admin\.category"/)?.[0] ?? "";

test("admin shop dashboard groups only shop product and category actions", () => {
  for (const label of ["🛍 داشبورد فروشگاه", "📦 محصولات", "🗂 دسته‌بندی‌ها", "➕ افزودن محصول", "➕ افزودن دسته‌بندی", "✅ محصولات فعال", "⛔ محصولات غیرفعال", "🔄 سینک با Xray"]) {
    assert.match(storeView, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  for (const unrelated of ["کاربران Xray", "واریزی", "تیکت", "اطلاع‌رسانی", "کیف پول"]) {
    assert.doesNotMatch(storeView, new RegExp(unrelated));
  }
});

test("admin product and category lists are paginated and callbacks stay within Telegram limit", () => {
  assert.match(productsView, /listProducts\(current, 8/);
  assert.match(productsView, /callbackFor\("admin\.products", \{ page: Math\.max\(current - 1, 1\), status \}\)/);
  assert.match(productsView, /callbackFor\("admin\.products", \{ page: current \+ 1, status \}\)/);
  assert.match(categoriesView, /listCategories\(current\)/);
  assert.match(categoriesView, /callbackFor\("admin\.categories", \{ page: Math\.max\(current - 1, 1\) \}\)/);
  assert.match(categoriesView, /callbackFor\("admin\.categories", \{ page: current \+ 1 \}\)/);

  for (const callback of [
    callbackFor("admin.store"),
    callbackFor("admin.products", { status: "inactive", page: 999 }),
    callbackFor("admin.categories", { page: 999 }),
  ]) {
    assert.ok(isValidCallbackData(callback), callback);
    assert.ok(Buffer.byteLength(callback, "utf8") <= 64, callback);
  }
});
