import { readFileSync } from "node:fs";
import { test } from "vitest";
import assert from "node:assert/strict";

const adminViews = readFileSync("src/bot/views/admin.views.ts", "utf8");
const viewModels = readFileSync("src/modules/admin/admin.view-models.ts", "utf8");
const keyboards = readFileSync("src/bot/keyboards/view-keyboards.ts", "utf8");
const panelUi = readFileSync("src/bot/navigation/panel-ui.ts", "utf8");

test("Xray center is a Persian operations dashboard with scoped buttons", () => {
  const center = adminViews.match(/registerView\("admin\.xrayCenter"[\s\S]*?registerView\("admin\.xrayPanels"/)?.[0] ?? "";
  assert.match(center, /🧩 مرکز مدیریت Xray/);
  for (const label of ["📡 وضعیت پنل", "👥 کاربران Xray", "📊 مصرف و ظرفیت", "⚠️ خطاها"]) assert.match(center, new RegExp(label));
  assert.match(center, /📡 پنل‌ها[\s\S]*👥 کاربران Xray/);
  assert.match(center, /🔄 همگام‌سازی[\s\S]*🧪 تست اتصال/);
  assert.match(center, /📊 گزارش مصرف[\s\S]*⚠️ خطاها/);
  assert.match(center, /⚙️ تنظیمات Xray[\s\S]*🔙 بازگشت[\s\S]*🏠 خانه/);
  assert.doesNotMatch(center, /افزودن محصول|دسته‌بندی‌ها|مدیریت فروشگاه/);
  assert.doesNotMatch(center, /Xray Center/);
});

test("Xray render view-model avoids external panel APIs and unavailable state is Persian", () => {
  assert.match(adminViews, /xrayCenterViewModel\(\)/);
  assert.doesNotMatch(viewModels, /XrayClientService|XrayPanelService|fetch\(/);
  assert.match(viewModels, /⚠️ نیازمند بررسی|⛔ غیرفعال/);
});

test("Xray sync flow previews before confirmation and masks panel tokens", () => {
  const sync = adminViews.match(/registerView\("admin\.xraySync"[\s\S]*?registerView\("admin\.xraySettings"/)?.[0] ?? "";
  assert.match(sync, /🔄 سینک محصولات با 3x-ui/);
  assert.match(sync, /پیش‌نمایش/);
  assert.match(sync, /تا زمانی که دکمه تأیید نهایی را نزنید/);
  assert.match(adminViews, /maskAdminSecret\(panel\.apiToken\)/);
  assert.match(viewModels, /••••/);
});

test("shop and entity detail buttons are grouped with safe navigation and danger separation", () => {
  const store = adminViews.match(/registerView\("admin\.store"[\s\S]*?registerView\("admin\.finance"/)?.[0] ?? "";
  assert.match(store, /📦 محصولات[\s\S]*🗂 دسته‌بندی‌ها/);
  assert.match(store, /➕ افزودن محصول[\s\S]*➕ افزودن دسته‌بندی/);
  assert.match(store, /✅ محصولات فعال[\s\S]*⛔ محصولات غیرفعال/);
  assert.match(store, /🔎 جستجوی محصول[\s\S]*🔄 سینک با Xray/);
  assert.match(store, /🔙 پنل مدیریت/);
  assert.match(adminViews, /✏️ ویرایش عنوان/);
  assert.match(adminViews, /🗑 آرشیو محصول/);
  assert.match(adminViews, /🔙 محصولات/);
  assert.match(adminViews, /✏️ ویرایش نام/);
  assert.match(adminViews, /🗑 آرشیو دسته/);
  assert.match(adminViews, /🔙 دسته‌بندی‌ها/);
});

test("guided edits stay single-field and dashboard grouping is clean", () => {
  for (const flow of ["product_edit", "category_edit", "xray_panel_setup"]) assert.match(adminViews, new RegExp(`flow:start:${flow}:[^\`]+:[a-zA-Z]`));
  assert.match(keyboards, /🛍 تجارت[\s\S]*👥 مشتریان/);
  assert.match(keyboards, /🧩 Xray[\s\S]*📣 بازاریابی/);
  assert.match(keyboards, /⚙️ سیستم[\s\S]*💳 مالی/);
  assert.match(keyboards, /📊 داشبورد[\s\S]*🏠 خانه/);
});

test("new callback routes are registered and literal callback data stays under Telegram limit", () => {
  for (const view of ["admin.xrayPanels", "admin.xrayPanel", "admin.xraySync", "admin.xraySyncPreview"]) assert.match(panelUi, new RegExp(`"${view}"`));
  const literals = [...adminViews.matchAll(/action: "([^"]+)"/g)].map((m) => m[1]).filter((value) => value.includes(":"));
  for (const cb of literals) assert.ok(Buffer.byteLength(cb) <= 64, `${cb} is too long`);
});
