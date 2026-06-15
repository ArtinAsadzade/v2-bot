import assert from "node:assert/strict";
import test from "node:test";
import { createCallbackToken, resolveCallbackToken, tokenAction } from "../src/bot/navigation/callback-tokens";
import type { AppContext } from "../src/types/bot";
import { isValidCallbackData } from "../src/bot/navigation/panel-ui";

function ctx(): AppContext {
  return { session: {} } as AppContext;
}

test("callback tokens preserve renewal context in compact callback_data", () => {
  const context = ctx();
  const token = createCallbackToken(context, "renewal", {
    xrayClientId: "6a2fcc310a407cdaca894bc9",
    productId: "7b2fcc310a407cdaca894bc8",
  });
  const callbacks = [tokenAction("xr:r:s", token), tokenAction("xr:r:w", token), tokenAction("xr:r:i", token)];

  for (const callback of callbacks) {
    assert.ok(isValidCallbackData(callback), callback);
    assert.ok(Buffer.byteLength(callback, "utf8") < 32, callback);
  }
  assert.deepEqual(resolveCallbackToken(context, "renewal", token), {
    xrayClientId: "6a2fcc310a407cdaca894bc9",
    productId: "7b2fcc310a407cdaca894bc8",
  });
});

test("callback tokens reject wrong types and keep Xray picker actions short", () => {
  const context = ctx();
  const groupToken = createCallbackToken(context, "xrayGroupSelect", {
    target: "product_edit",
    selected: "Long production group name with spaces",
    productId: "6a2fcc310a407cdaca894bc9",
  });
  const productToken = createCallbackToken(context, "xrayPickerProduct", {
    target: "product_edit",
    productId: "6a2fcc310a407cdaca894bc9",
  });

  for (const callback of [tokenAction("xpg:s", groupToken), tokenAction("xpi:l:pe", productToken), tokenAction("xpg:l:pe", productToken)]) {
    assert.ok(isValidCallbackData(callback), callback);
    assert.ok(Buffer.byteLength(callback, "utf8") < 40, callback);
  }
  assert.equal(resolveCallbackToken(context, "renewal", groupToken), null);
});
