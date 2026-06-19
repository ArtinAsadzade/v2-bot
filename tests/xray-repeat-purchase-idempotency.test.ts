import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";

const delivery = fs.readFileSync("src/modules/payment/payment-delivery.service.ts", "utf8");
const fulfillment = fs.readFileSync("src/modules/payment/payment-fulfillment.service.ts", "utf8");
const payment = fs.readFileSync("src/modules/payment/payment.service.ts", "utf8");
const accounts = fs.readFileSync("src/bot/views/account.views.ts", "utf8") + "\n" + fs.readFileSync("src/bot/handlers/modern/xray.handlers.ts", "utf8");
const repairDoc = fs.readFileSync("docs/xray-repeat-purchase-repair.md", "utf8");

test("new Xray purchases do not reuse clients by user and product", () => {
  const purchase = delivery.match(/static async purchaseProduct[\s\S]*?static async provisionXrayClient/)?.[0] ?? "";
  assert.doesNotMatch(purchase, /xrayClient\.findFirst\(\{\s*where:\s*\{\s*userId:[\s\S]*?productId:/);
  assert.doesNotMatch(purchase, /XRAY_DUPLICATE_PURCHASE_REUSED/);
  assert.match(purchase, /const order = await tx\.order\.create/);
  assert.match(purchase, /xrayClient = await tx\.xrayClient\.create/);
  assert.match(purchase, /xrayClientEmail\(\{ telegramId: user\.telegramId, productId: product\.id, orderId: order\.id \}\)/);
});

test("Xray idempotency reuse is scoped to the same order", () => {
  const provision = delivery.match(/static async provisionXrayClient[\s\S]*?\n\n}/)?.[0] ?? "";
  assert.match(provision, /where: \{ orderId \}/);
  assert.match(provision, /client\.orderId !== orderId/);
  assert.match(provision, /XRAY_IDEMPOTENCY_REUSE_CHECK/);
  assert.match(provision, /XRAY_IDEMPOTENCY_REUSE_ALLOWED_SAME_ORDER/);
  assert.match(provision, /XRAY_IDEMPOTENCY_REUSE_REJECTED_DIFFERENT_ORDER/);
  assert.match(provision, /orderItem\.findFirst\(\{ where: \{ xrayClientId: client\.id, orderId \} \}\)/);
});

test("required repeat-purchase logs and cleanup guidance exist", () => {
  for (const event of [
    "XRAY_REPEAT_PURCHASE_STARTED",
    "XRAY_IDEMPOTENCY_REUSE_CHECK",
    "XRAY_IDEMPOTENCY_REUSE_ALLOWED_SAME_ORDER",
    "XRAY_IDEMPOTENCY_REUSE_REJECTED_DIFFERENT_ORDER",
    "XRAY_NEW_CLIENT_REQUIRED",
    "XRAY_NEW_CLIENT_CREATED",
  ]) assert.match(delivery, new RegExp(event));
  assert.match(repairDoc, /Do not hard-delete historical Xray purchase records automatically/);
});

test("pending locks are limited to pending invoices and unfinished orders", () => {
  const resolver = payment.match(/static async resolveExistingPurchaseIntent[\s\S]*?static async cancelExistingPurchaseIntent/)?.[0] ?? "";
  assert.match(resolver, /status: \{ in: \["PENDING", "PAID"\] \}/);
  assert.match(resolver, /status: \{ in: \["pending", "reserving", "panel_creating", "panel_verified"\] \}/);
  assert.doesNotMatch(resolver, /completed/);
  assert.doesNotMatch(resolver, /delivered/);
});

test("same invoice callbacks resume the same order instead of creating another client", () => {
  assert.match(fulfillment, /if \(fresh\.orderId\)/);
  assert.match(fulfillment, /needsXrayProvisioning/);
  assert.match(fulfillment, /PaymentDeliveryService\.provisionXrayClient\(deps\.deliveryDeps, \(result as any\)\.order\.id, invoice\.id\)/);
});

test("My Accounts is keyed by individual Xray client id", () => {
  assert.match(accounts, /xrayClientId: client\.id/);
  assert.match(accounts, /where: \{ id: params\.xrayClientId, userId: user\.id \}/);
  assert.match(accounts, /XrayClientService\.subscriptionUrl\(client\)/);
});
