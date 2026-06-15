import assert from "node:assert/strict";
import test from "node:test";
import { actionFor, callbackFor, isValidCallbackData } from "../src/bot/navigation/panel-ui";

export function assertTelegramCallbackData(value: string) {
  assert.ok(isValidCallbackData(value), `callback_data exceeds Telegram 64-byte limit (${Buffer.byteLength(value, "utf8")} bytes): ${value}`);
}

test("baseline callback helpers emit Telegram-safe callback_data", () => {
  const samples = [
    callbackFor("home"),
    callbackFor("account.renew.products", { xrayClientId: "xray_client_123", categoryId: "category_123" }),
    callbackFor("account.renew.summary", { xrayClientId: "xray_client_123", productId: "product_123" }),
    actionFor("flow:start", "coupon_code", "product_123"),
    actionFor("support:close", "ticket_123"),
  ];

  for (const sample of samples) assertTelegramCallbackData(sample);
});
