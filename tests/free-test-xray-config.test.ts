import assert from "node:assert/strict";
import test from "node:test";
import { validateFreeTestActivation, validateFreeTestInboundSelection, FreeAccountError } from "../src/modules/free-account/free-account.service";
import { xrayInboundSnapshot } from "../src/modules/xray/xray.service";

const inbounds = [
  { id: 10, remark: "Turkey", protocol: "vless", port: 2086, tag: "tr-ws", nodeId: 1 },
  { id: 20, remark: "Germany", protocol: "vless", port: 9443, tag: "de-xhttp", nodeId: 2 },
];

test("cannot enable free test with no inboundIds", () => {
  const reason = validateFreeTestActivation({ trafficBytes: 1n, durationDays: 1, stockLimit: 1, inboundIds: [] }, true);
  assert.equal(reason, "ابتدا حداقل یک اینباند انتخاب کنید.");
});

test("can fetch live inbounds shape used by selector", () => {
  assert.equal(inbounds.length, 2);
  assert.deepEqual(inbounds.map((inbound) => inbound.id), [10, 20]);
});

test("can select one inbound", () => {
  const result = validateFreeTestInboundSelection(inbounds, [10]);
  assert.deepEqual(result.inboundIds, [10]);
});

test("can select multiple inbounds", () => {
  const result = validateFreeTestInboundSelection(inbounds, [10, 20]);
  assert.deepEqual(result.inboundIds, [10, 20]);
});

test("selected inbound IDs are saved in normalized unique order", () => {
  const result = validateFreeTestInboundSelection(inbounds, [10, 10, 20]);
  assert.deepEqual(result.inboundIds, [10, 20]);
});

test("selected inbound snapshot is saved", () => {
  const result = validateFreeTestInboundSelection(inbounds, [20]);
  assert.equal(result.inboundSnapshot, xrayInboundSnapshot(inbounds, [20]));
  assert.match(result.inboundSnapshot, /Germany/);
  assert.match(result.inboundSnapshot, /9443/);
});

test("enable succeeds after traffic duration stock and inbounds are valid", () => {
  const reason = validateFreeTestActivation({ trafficBytes: 1024n, durationDays: 1, stockLimit: 5, inboundIds: [10] }, true);
  assert.equal(reason, undefined);
});

test("claim uses saved inboundIds payload shape", () => {
  const savedInboundIds = [10, 20];
  const payload = { client: { email: "test", totalGB: 1024, expiryTime: 1, tgId: 123, limitIp: 0, enable: true }, inboundIds: savedInboundIds };
  assert.deepEqual(payload.inboundIds, savedInboundIds);
});

test("claim fails gracefully if inboundIds are empty", () => {
  assert.throws(() => validateFreeTestInboundSelection(inbounds, []), (error) => error instanceof FreeAccountError && error.message === "حداقل یک اینباند لازم است");
});
