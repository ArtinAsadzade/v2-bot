import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { test } from "vitest";

const diagnostics = readFileSync("src/modules/xray/xray-diagnostics.service.ts", "utf8");
const delivery = readFileSync("src/modules/payment/payment-delivery.service.ts", "utf8");
const payment = readFileSync("src/modules/payment/payment.service.ts", "utf8");
const views = readFileSync("src/bot/views/admin.views.ts", "utf8");
const handlers = readFileSync("src/bot/handlers/modern/admin/admin-xray.handlers.ts", "utf8");

test("stale inbound detection compares DB inboundIds against current panel inbounds", () => {
  assert.match(diagnostics, /staleInboundClientIds/);
  assert.match(diagnostics, /valid\.has\(id\)/);
  assert.match(diagnostics, /reason: "stale_inbounds"/);
});

test("missing panel clients are detected and reported", () => {
  assert.match(diagnostics, /panelClientFrom\(detail, client\.clientEmail\)/);
  assert.match(diagnostics, /reason: "client_missing"/);
  assert.match(diagnostics, /missingOnPanel/);
});

test("verify result reasons are typed and exhaustive for admin repair flow", () => {
  for (const reason of ["panel_offline", "subscription_unreachable", "client_missing", "stale_inbounds", "missing_sub_id", "unknown_error"]) {
    assert.match(diagnostics, new RegExp(reason));
  }
});

test("repair does not activate until verification succeeds", () => {
  const repair = diagnostics.match(/static async repairClient[\s\S]*?static async cleanupBrokenClients/)?.[0] ?? "";
  assert.match(repair, /const verified = await this\.verifyXrayClient\(client\.id\)/);
  assert.match(repair, /if \(!verified\.ok\) return \{ ok: false/);
  assert.match(repair, /status: "active"/);
});

test("cleanup hides broken clients instead of hard-deleting orders", () => {
  assert.match(diagnostics, /status: verify\.reason === "client_missing" \? "missing_on_panel" : "deleted"/);
  assert.match(diagnostics, /orderItem\.updateMany[\s\S]*isActive: false/);
  assert.doesNotMatch(diagnostics, /order\.delete/);
});

test("delivery does not complete if Xray verification fails", () => {
  assert.match(delivery, /XrayDiagnosticsService\.verifyXrayClient\(client\.id\)/);
  assert.match(delivery, /if \(!verified\.ok\) throw new Error\(`XRAY_VERIFICATION_FAILED:\$\{verified\.reason\}`\)/);
  assert.match(delivery, /status: "failed_delivery"/);
  assert.match(payment, /XrayDiagnosticsService\.listPanelInbounds\(\)/);
});

test("admin Xray Center UI exposes required actions", () => {
  for (const label of ["🧩 Xray Center", "🔄 Test Panel API", "🔗 Test Subscription URL", "📡 Inbounds", "🔍 Verify Client", "🛠 Repair Client", "🧹 Cleanup Broken Clients", "📊 Sync Report"]) {
    assert.match(views, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(handlers, /cleanupBrokenClients/);
  assert.match(handlers, /repairClient/);
});
