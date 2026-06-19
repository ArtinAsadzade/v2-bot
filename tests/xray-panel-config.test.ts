import assert from "node:assert/strict";
import { test } from "vitest";
import { parseKeyValueLines } from "../src/bot/flows/flow-engine";
import { mergeXrayConfigPatch, normalizeBaseUrl, normalizeSubscriptionBaseUrl } from "../src/modules/xray/xray.service";

test("parser preserves URLs containing colons", () => {
  const data = parseKeyValueLines("apiBaseUrl: https://ir.artmn.site:50055/aICFRUOLVi4hG8TOkm/");
  assert.equal(data.apiBaseUrl, "https://ir.artmn.site:50055/aICFRUOLVi4hG8TOkm/");
});

test("normalizes full OpenAPI URL to security-path base", () => {
  assert.equal(normalizeBaseUrl("https://ir.artmn.site:50055/aICFRUOLVi4hG8TOkm/panel/api/openapi.json"), "https://ir.artmn.site:50055/aICFRUOLVi4hG8TOkm");
});

test("normalizes full endpoint URL to security-path base", () => {
  assert.equal(normalizeBaseUrl("https://ir.artmn.site:50055/aICFRUOLVi4hG8TOkm/panel/api/inbounds/options"), "https://ir.artmn.site:50055/aICFRUOLVi4hG8TOkm");
});

test("partial apiBaseUrl update preserves existing token", () => {
  const merged = mergeXrayConfigPatch({ apiBaseUrl: "https://old", apiToken: "oldtoken", subscriptionBaseUrl: "https://sub", enabled: true }, { apiBaseUrl: "https://new.example.com/path" });
  assert.equal(merged.apiBaseUrl, "https://new.example.com/path");
  assert.equal(merged.apiToken, "oldtoken");
});

test("partial apiToken update preserves existing apiBaseUrl", () => {
  const merged = mergeXrayConfigPatch({ apiBaseUrl: "https://old.example.com/path", apiToken: "oldtoken", subscriptionBaseUrl: null, enabled: true }, { apiToken: "newtoken" });
  assert.equal(merged.apiBaseUrl, "https://old.example.com/path");
  assert.equal(merged.apiToken, "newtoken");
});

test("blank subscriptionBaseUrl is optional", () => {
  assert.equal(normalizeSubscriptionBaseUrl(""), undefined);
});
