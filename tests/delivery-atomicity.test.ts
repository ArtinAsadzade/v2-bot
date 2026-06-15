import { readFileSync } from "fs";
import test from "node:test";
import assert from "node:assert/strict";

const schema = readFileSync("prisma/schema.prisma", "utf8");
const payment = readFileSync("src/modules/payment/payment.service.ts", "utf8");
const free = readFileSync("src/modules/free-account/free-account.service.ts", "utf8");
const xray = readFileSync("src/modules/xray/xray.service.ts", "utf8");
const cleanup = readFileSync("src/jobs/deliveryCleanup.ts", "utf8");
const sync = readFileSync("src/scripts/sync-xray-deliveries.ts", "utf8");

test("delivery state machine and reservation expiry fields exist", () => {
  for (const status of ["pending", "reserving", "panel_creating", "panel_verified", "delivered", "failed", "cancelled", "refund_required", "refunded"]) assert.match(schema, new RegExp(`\\b${status}\\b`));
  assert.match(schema, /reservationExpiresAt\s+DateTime\?/);
  assert.match(schema, /enum FreeAccountStatus[\s\S]*reserved/);
});

test("xray paid purchase debits wallet only after panel verification", () => {
  const provision = payment.match(/private static async provisionXrayClient[\s\S]*?static async purchaseProductWithWallet/)?.[0] ?? "";
  assert.match(provision, /verifyPanelClient/);
  assert.match(provision, /status: "panel_verified"/);
  assert.match(provision, /debitWallet/);
  assert.ok(provision.indexOf("verifyPanelClient") < provision.indexOf("debitWallet"));
  const purchase = payment.match(/static async purchaseProduct[\s\S]*?private static async provisionXrayClient/)?.[0] ?? "";
  assert.match(purchase, /status: isXray \? "pending" : "completed"/);
  assert.match(purchase, /!isXray && data\.method === "WALLET"/);
  assert.doesNotMatch(purchase.match(/if \(isXray\)[\s\S]*?\} else \{/)?.[0] ?? "", /soldCount:\s*\{\s*increment/);
});

test("free xray quota and monthly lock are recorded only after verify", () => {
  assert.match(free, /verifyPanelClient/);
  assert.ok(free.indexOf("verifyPanelClient") < free.indexOf("freeAccountUserLock.upsert"));
  assert.ok(free.indexOf("verifyPanelClient") < free.indexOf("usedCount: { increment: 1 }") );
  assert.match(free, /free_xray\.failed/);
});

test("cleanup and sync helpers handle stale reservations and panel mismatches", () => {
  assert.match(cleanup, /productAccount\.updateMany/);
  assert.match(cleanup, /freeAccount\.updateMany/);
  assert.match(cleanup, /status: \{ in: \["pending", "reserving", "panel_creating"\] \}/);
  assert.match(sync, /missingInPanel/);
  assert.match(sync, /missingInDb/);
  assert.match(sync, /xray_sync\.missing_in_panel/);
});

test("panel client verification fetches live client instead of trusting create response", () => {
  assert.match(xray, /verifyPanelClient/);
  assert.match(xray, /getClient\(input\.email\)/);
  assert.match(xray, /شناسه کلاینت\/اشتراک در پنل معتبر نیست/);
});
