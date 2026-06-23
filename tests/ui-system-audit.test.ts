import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "vitest";
import { buildInlineKeyboard } from "../src/bot/keyboards/design-system";
import { callbackFor, panelKeyboard, type UiKeyboard } from "../src/bot/navigation/panel-ui";
import { normalizeKeyboardLayout, uiSystem } from "../src/bot/ui/ui-system";

const sourceFiles = [
  "src/bot/navigation/panel-ui.ts",
  "src/bot/keyboards/design-system.ts",
  "src/bot/keyboards/view-keyboards.ts",
  "src/bot/keyboards/common.keyboard.ts",
  "src/bot/keyboards/account.keyboard.ts",
  "src/bot/keyboards/purchase.keyboard.ts",
  "src/bot/views/home.views.ts",
  "src/bot/views/account.views.ts",
  "src/bot/views/purchase.views.ts",
  "src/bot/views/wallet.views.ts",
  "src/bot/views/support.views.ts",
  "src/bot/views/admin.views.ts",
  "src/bot/views/modern.views.ts",
  "src/bot/views/product.views.ts",
  "src/bot/views/free-account.views.ts",
  "src/bot/views/prediction.views.ts",
  "src/bot/handlers/modern/purchase.handlers.ts",
  "src/bot/handlers/modern/support.handlers.ts",
  "src/bot/handlers/modern/admin/admin-xray.handlers.ts",
  "src/bot/handlers/modern/admin/admin-inventory.handlers.ts",
];
const uiSource = sourceFiles.map((file) => `${file}\n${readFileSync(file, "utf8")}`).join("\n");

test("all Telegram button styling flows through the central UI system", () => {
  assert.match(readFileSync("src/bot/navigation/panel-ui.ts", "utf8"), /normalizeKeyboardLayout/);
  assert.match(readFileSync("src/bot/navigation/panel-ui.ts", "utf8"), /styleForDesignButton/);
  assert.match(readFileSync("src/bot/keyboards/design-system.ts", "utf8"), /buttonIntent|styledButtonFields/);
  assert.match(readFileSync("src/bot/ui/ui-system.ts", "utf8"), /uiIntentTone/);
});

test("layouts are balanced into predictable rows and destructive actions are separated", () => {
  const layout: UiKeyboard = [[
    { text: "✏️ ویرایش", action: "a:edit" },
    { text: "🗑 حذف", action: "a:delete", tone: "danger" },
    { text: "📊 گزارش", action: "a:report" },
    { text: "🏠 خانه", action: callbackFor("home") },
  ]];
  const normalized = normalizeKeyboardLayout(layout);
  assert.equal(normalized.every((row) => row.length <= uiSystem.maxButtonsPerRow), true);
  assert.deepEqual(normalized.map((row) => row.map((button) => button.text)), [["✏️ ویرایش"], ["📊 گزارش", "🏠 خانه"], ["🗑 حذف"]]);
});

test("panel keyboards style unstyled buttons by inferred intent and keep navigation neutral", () => {
  const keyboard = panelKeyboard(
    [[{ text: "💳 پرداخت", action: "buy:confirm:p1" }, { text: "🗑 حذف", action: "admin:item:delete:1" }, { text: "🏠 خانه", action: callbackFor("home") }]],
    { back: false, home: false },
  ).reply_markup.inline_keyboard as Array<Array<{ text: string; style?: string }>>;
  assert.deepEqual(keyboard.map((row) => row.length), [2, 1]);
  const flat = keyboard.flat();
  assert.equal(flat.find((button) => button.text.includes("پرداخت"))?.style, "success");
  assert.equal(flat.find((button) => button.text.includes("حذف"))?.style, "danger");
  assert.equal(flat.find((button) => button.text.includes("خانه"))?.style, undefined);
});

test("inline and reply-keyboard IA share the same intent language", () => {
  const inline = buildInlineKeyboard([[{ text: "🛒 خرید سرویس", action: callbackFor("shop.categories"), intent: "buy" }]]).reply_markup.inline_keyboard;
  assert.equal((inline[0][0] as any).style, "success");
  assert.match(uiSource, /replyKeyboard: "home"|replyKeyboard: "admin"|replyKeyboard: "profile"|replyKeyboard: "wallet"|replyKeyboard: "support"/);
});

test("navigation and callback surface has no obvious orphan or dead panel callbacks", () => {
  const panelIds = [...uiSource.matchAll(/registerView\("([^"]+)"/g)].map((m) => m[1]);
  const navTargets = [...uiSource.matchAll(/callbackFor\("([^"]+)"/g)].map((m) => m[1]);
  const idSet = new Set(panelIds);
  for (const target of navTargets) assert.ok(idSet.has(target) || target === "home", `missing registered view for ${target}`);
  assert.ok(panelIds.includes("admin.xrayCenter"));
  assert.ok(panelIds.includes("shop.checkout"));
});
