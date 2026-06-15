import assert from "node:assert/strict";
import test from "node:test";
import { callbackFor, isValidCallbackData, parseNavAction } from "../src/bot/navigation/panel-ui";

const productId = "6a2fcc310a407cdaca894bc9";
const statuses = ["active", "provisioning", "failed", "expired", "missing_on_panel"];

test("admin.xrayClients global filter callbacks stay within Telegram limit", () => {
  for (const status of statuses) {
    const callback = callbackFor("admin.xrayClients", { status });
    assert.ok(isValidCallbackData(callback), callback);
    assert.ok(Buffer.byteLength(callback, "utf8") <= 64, callback);
    assert.equal(parseNavAction(callback)?.params?.status, status);
  }
});

test("admin.xrayClients product filter callbacks stay within Telegram limit", () => {
  for (const status of statuses) {
    const callback = callbackFor("admin.xrayClients", { productId, status });
    assert.ok(isValidCallbackData(callback), callback);
    assert.ok(Buffer.byteLength(callback, "utf8") <= 64, callback);
    const parsed = parseNavAction(callback);
    assert.equal(parsed?.params?.productId, productId);
    assert.equal(parsed?.params?.status, status);
  }
});

test("provisioning and generated-client product detail callbacks are valid", () => {
  assert.ok(isValidCallbackData(callbackFor("admin.xrayClients", { productId, status: "provisioning" })));
  assert.ok(isValidCallbackData(callbackFor("admin.xrayClients", { productId })));
});

test("short Xray picker callbacks for group and inbounds are valid", () => {
  const callbacks = [
    `xpg:s:pe:0:${productId}`,
    `xpg:s:pe:n:${productId}`,
    `xpg:l:pe:${productId}`,
    `xpi:t:pe:12345:${productId}`,
    `xpi:s:pe:${productId}`,
    `xpi:l:pe:${productId}`,
  ];
  for (const callback of callbacks) assert.ok(isValidCallbackData(callback), callback);
});
