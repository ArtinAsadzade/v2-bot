import { readFileSync } from "node:fs";
import { test } from "vitest";
import assert from "node:assert/strict";

const payment = (readFileSync("src/modules/payment/payment.service.ts", "utf8") + "\n" + readFileSync("src/modules/payment/payment.types.ts", "utf8") + "\n" + readFileSync("src/modules/payment/payment-fulfillment.service.ts", "utf8") + "\n" + readFileSync("src/modules/payment/payment-delivery.service.ts", "utf8") + "\n" + readFileSync("src/modules/payment/payment-callback.service.ts", "utf8") + "\n" + readFileSync("src/modules/payment/wallet-payment.service.ts", "utf8") + "\n" + readFileSync("src/modules/payment/gateway-payment.service.ts", "utf8") + "\n" + readFileSync("src/modules/payment/payment-discount.service.ts", "utf8") + "\n" + readFileSync("src/modules/payment/payment-notification.service.ts", "utf8") + "\n" + readFileSync("src/modules/payment/payment-repository.ts", "utf8"));
const xray = readFileSync("src/modules/xray/xray.service.ts", "utf8");
const schema = readFileSync("prisma/schema.prisma", "utf8");

const purchase = payment.match(/static async purchaseProduct\(deps[\s\S]*?static async provisionXrayClient/)?.[0] ?? "";
const provision = payment.match(/static async provisionXrayClient\(deps[\s\S]*?\n\n}/)?.[0] ?? "";

test("wallet insufficient stops before reservation, order delivery, and panel calls", () => {
  assert.match(purchase, /walletUser\.balance < totalAmount[\s\S]*موجودی کیف پول کافی نیست/);
  assert.ok(purchase.indexOf("walletUser.balance < totalAmount") < purchase.indexOf("productAccount.findMany"));
  assert.ok(purchase.indexOf("walletUser.balance < totalAmount") < purchase.indexOf("order.create"));
  assert.doesNotMatch(purchase.slice(0, purchase.indexOf("walletUser.balance < totalAmount")), /createClient|addClient|XrayClientService\./);
});

test("wallet sufficient and panel success verifies before debit, completion, and delivery item", () => {
  assert.match(provision, /createClient/);
  assert.match(provision, /verifyPanelClient\([\s\S]*requireLinks: true/);
  assert.match(provision, /debitWallet/);
  assert.match(provision, /orderItem\.create/);
  assert.match(provision, /status: "delivered"/);
  assert.ok(provision.indexOf("verifyPanelClient") < provision.indexOf("debitWallet"));
  assert.ok(provision.indexOf("verifyPanelClient") < provision.indexOf("orderItem.create"));
  assert.ok(provision.indexOf("debitWallet") < provision.indexOf('status: "delivered"'));
});

test("wallet sufficient but panel timeout or verify failure does not debit and marks failed cleanup", () => {
  const catchBlock = provision.match(/catch \(error\)[\s\S]*?throw new Error\([\s\S]*?ساخت اکانت/)?.[0] ?? "";
  assert.match(catchBlock, /deleteClient/);
  assert.match(catchBlock, /orphaned_panel_client/);
  assert.match(catchBlock, /status: "failed_delivery"/);
  assert.doesNotMatch(catchBlock, /debitWallet|walletTransaction\.create|balance: \{ decrement/);
});

test("panel client created but verify fails is deleted or flagged for admin audit", () => {
  assert.match(schema, /orphaned_panel_client/);
  assert.match(xray, /deleteClient/);
  assert.match(provision, /panelClientCreated = true[\s\S]*verifyPanelClient/);
  assert.match(provision, /xray_delivery\.orphaned_panel_client/);
  assert.match(provision, /cleanupStatus: "failed" \| "orphaned_panel_client"/);
});

test("double-click wallet purchase is guarded before duplicate panel create or debit", () => {
  assert.match(purchase, /xrayClient\.findFirst[\s\S]*درخواست قبلی/);
  assert.match(provision, /xrayClient\.updateMany\([\s\S]*status: "provisioning"[\s\S]*status: "creating"/);
  assert.ok(provision.indexOf("updateMany") < provision.indexOf("createClient"));
  assert.ok(provision.indexOf("updateMany") < provision.indexOf("debitWallet"));
});
