import { readFileSync } from "fs";
import test from "node:test";
import assert from "node:assert/strict";
import { calculateAccountDisplayStatus } from "../src/modules/account/account-status.service";

const payment = readFileSync("src/modules/payment/payment.service.ts", "utf8");
const schema = readFileSync("prisma/schema.prisma", "utf8");
const userService = readFileSync("src/modules/user/user.service.ts", "utf8");
const repair = readFileSync("scripts/repair-broken-order-items.ts", "utf8");

test("manual purchase reserves and sells ProductAccount defensively in one transaction", () => {
  assert.match(payment, /prisma\.\$transaction\(\(tx\) => this\.purchaseProduct/);
  assert.match(payment, /status: "available"/);
  assert.match(payment, /status: "reserved"/);
  assert.match(payment, /status: "sold"/);
  assert.match(payment, /assignedTo: data\.userId/);
  assert.match(payment, /expiresAt/);
  assert.match(payment, /if \(!orderItem\.productAccountId\) throw new Error/);
});

test("OrderItem can mark legacy broken data and ProductAccount assignment is unique", () => {
  assert.match(schema, /legacyStatus\s+String\?/);
  assert.match(schema, /@@unique\(\[productAccountId\]\)/);
  assert.match(schema, /assignedTo\s+String\?/);
  assert.match(schema, /disabledAt\s+DateTime\?/);
});

test("My Accounts tolerates broken legacy OrderItems", () => {
  assert.match(userService, /calculateAccountDisplayStatus/);
  assert.match(userService, /legacyStatus === "broken_product_account"/);
  assert.match(userService, /include: \{ order: true, product: true, productAccount: true, xrayClient: true \}/);
});

test("repair script reports and safely marks unrecoverable broken records", () => {
  assert.match(repair, /brokenCount/);
  assert.match(repair, /repaired/);
  assert.match(repair, /markedLegacy/);
  assert.match(repair, /legacyStatus: "broken_product_account"/);
});

test("central account status covers active, expired, disabled, broken and legacy", () => {
  assert.equal(calculateAccountDisplayStatus({ status: "sold", expiresAt: new Date(Date.now() + 1000), productActive: true }), "active");
  assert.equal(calculateAccountDisplayStatus({ status: "sold", expiresAt: new Date(Date.now() - 1000) }), "expired");
  assert.equal(calculateAccountDisplayStatus({ status: "disabled" }), "disabled");
  assert.equal(calculateAccountDisplayStatus({ hasRequiredDeliveryData: false }), "broken");
  assert.equal(calculateAccountDisplayStatus({ legacy: true }), "legacy");
});
