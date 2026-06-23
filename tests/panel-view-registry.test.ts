import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "vitest";
import { callbackFor, PANEL_VIEW_IDS, parseNavAction, registeredPanelViewIds } from "../src/bot/navigation/panel-ui";
import { registerModernViews } from "../src/bot/views/modern.views";
import { readAdminViewsSource } from "./helpers/view-source";

const source = (readFileSync("src/bot/views/modern.views.ts", "utf8") + "\n" + readFileSync("src/bot/views/home.views.ts", "utf8") + "\n" + readFileSync("src/bot/views/product.views.ts", "utf8") + "\n" + readFileSync("src/bot/views/purchase.views.ts", "utf8") + "\n" + readFileSync("src/bot/views/account.views.ts", "utf8") + "\n" + readFileSync("src/bot/views/wallet.views.ts", "utf8") + "\n" + readFileSync("src/bot/views/support.views.ts", "utf8") + "\n" + readFileSync("src/bot/views/free-account.views.ts", "utf8") + "\n" + readAdminViewsSource());

registerModernViews();

test("modern view callbackFor targets are known panel view ids", () => {
  const targets = [...source.matchAll(/callbackFor\("([^"]+)"/g)].map((match) => match[1]);
  assert.ok(targets.length > 0, "expected callbackFor targets in modern.views.ts");

  const missing = [...new Set(targets)].filter((target) => !PANEL_VIEW_IDS.has(target));
  assert.deepEqual(missing, []);
});

test("modern view callbackFor targets are registered views", () => {
  const targets = [...source.matchAll(/callbackFor\("([^"]+)"/g)].map((match) => match[1]);
  const registered = new Set(registeredPanelViewIds());
  const missing = [...new Set(targets)].filter((target) => !registered.has(target as never));
  assert.deepEqual(missing, []);
});

test("admin Xray nav callbacks parse to real registered views", () => {
  const registered = new Set(registeredPanelViewIds());

  for (const id of ["admin.xraySettings", "admin.xrayClients"] as const) {
    const parsed = parseNavAction(callbackFor(id));
    assert.equal(parsed?.id, id);
    assert.ok(registered.has(id));
  }
});
