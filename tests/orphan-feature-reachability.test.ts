import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { test } from "vitest";
import { callbackFor, isValidCallbackData } from "../src/bot/navigation/panel-ui";
import { readAdminViewsSource } from "./helpers/view-source";

const adminViews = readAdminViewsSource();
const homeViews = readFileSync("src/bot/views/home.views.ts", "utf8");
const freeAccountViews = readFileSync("src/bot/views/free-account.views.ts", "utf8");
const predictionViews = readFileSync("src/bot/views/prediction.views.ts", "utf8");
const xrayPanelViews = readFileSync("src/bot/views/admin/admin-xray-panels.views.ts", "utf8");
const xraySyncViews = readFileSync("src/bot/views/admin/admin-xray-sync.views.ts", "utf8");
const adminHandlers = readFileSync("src/bot/handlers/modern/admin/admin-inventory.handlers.ts", "utf8") + "\n" + readFileSync("src/bot/handlers/modern/admin/admin-xray.handlers.ts", "utf8");
const productViews = readFileSync("src/bot/views/product.views.ts", "utf8");
const accountViews = readFileSync("src/bot/views/account.views.ts", "utf8");
const walletViews = readFileSync("src/bot/views/wallet.views.ts", "utf8");
const supportViews = readFileSync("src/bot/views/support.views.ts", "utf8");
const allViews = adminViews + "\n" + homeViews + "\n" + freeAccountViews + "\n" + predictionViews + "\n" + productViews + "\n" + accountViews + "\n" + walletViews + "\n" + supportViews;

const registeredViews = new Set([...allViews.matchAll(/registerView\("([^"]+)"/g)].map((match) => match[1]));
const visibleTargets = [...allViews.matchAll(/callbackFor\("([^"]+)"/g)].map((match) => match[1]);

test("visible button callbacks point to registered views and fit Telegram callback limit", () => {
  for (const target of visibleTargets) {
    assert.ok(registeredViews.has(target), `Missing registered view for ${target}`);
    const callback = callbackFor(target as never);
    assert.ok(isValidCallbackData(callback), callback);
    assert.ok(Buffer.byteLength(callback, "utf8") <= 64, callback);
  }
});

test("test/free account feature is reachable from admin store and user home", () => {
  const storeView = adminViews.match(/registerView\("admin\.store"[\s\S]*?registerView\("admin\.finance"/)?.[0] ?? "";
  assert.match(storeView, /callbackFor\("admin\.freeAccounts"\)/);
  assert.match(adminViews, /registerView\("admin\.freeAccounts"/);
  assert.match(adminViews, /flow:start:free_test_config:trafficGB/);
  assert.match(adminViews, /admin:xray_picker:inbounds:free_test/);
  assert.match(adminHandlers, /admin:free_test:enabled/);
  assert.match(readFileSync("src/bot/keyboards/common.keyboard.ts", "utf8"), /view: "freeAccount"/);
  assert.match(freeAccountViews, /freeAccount:claim/);
});

test("prediction user and admin flows remain reachable", () => {
  assert.match(readFileSync("src/bot/keyboards/common.keyboard.ts", "utf8"), /view: "prediction"/);
  assert.match(allViews + readFileSync("src/bot/keyboards/view-keyboards.ts", "utf8"), /callbackFor\("admin\.predictions"\)/);
  for (const view of ["prediction", "prediction.detail", "prediction.results", "admin.predictions", "admin.predictionList", "admin.predictionDetail", "admin.predictionResult", "admin.predictionStats", "admin.predictionParticipants"]) {
    assert.ok(registeredViews.has(view), view);
  }
  assert.match(predictionViews, /actionFor\("flow:start", "prediction_create"\)/);
  assert.match(readFileSync("src/bot/handlers/modern/prediction.handlers.ts", "utf8"), /\^pr:p:/);
  assert.match(readFileSync("src/bot/handlers/modern/prediction.handlers.ts", "utf8"), /\^pr:cl:/);
});

test("bulk inbound update is reachable from Xray center and store sync area", () => {
  const storeView = adminViews.match(/registerView\("admin\.store"[\s\S]*?registerView\("admin\.finance"/)?.[0] ?? "";
  assert.match(adminViews, /callbackFor\("admin\.xrayBulkInbound"\)/);
  assert.match(storeView, /callbackFor\("admin\.xrayBulkInbound"\)/);
  for (const view of ["admin.xrayBulkInbound", "admin.xrayBulkInboundPanel", "admin.xrayBulkInboundPreview"]) {
    assert.ok(registeredViews.has(view), view);
  }
  assert.match(xraySyncViews, /➡️ انتخاب پنل/);
  assert.match(adminHandlers, /admin:xb:apply/);
});

test("Xray panel settings include list, add second panel, edit, test, inbound, default inbound and sync entry points", () => {
  assert.match(adminViews, /callbackFor\("admin\.xrayPanels"\)/);
  assert.match(xrayPanelViews, /flow:start:xray_panel_setup:new:name/);
  assert.match(xrayPanelViews, /`flow:start:xray_panel_setup:\$\{panel\.id\}:apiBaseUrl`/);
  assert.match(xrayPanelViews, /`admin:xray:test:\$\{panel\.id\}`/);
  assert.match(xrayPanelViews, /`admin:xray:inbounds:\$\{panel\.id\}`/);
  assert.match(xrayPanelViews, /inbound پیش‌فرض/);
  assert.match(adminViews, /callbackFor\("admin\.xraySync"\)/);
});
