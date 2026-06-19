import assert from "node:assert/strict";
import { test } from "vitest";
import { auditLog } from "../src/services/audit-log";

test("auditLog emits structured metadata fields", () => {
  const originalInfo = console.info;
  const originalLog = console.log;
  const lines: string[] = [];
  console.log = (message?: unknown) => { lines.push(String(message)); };
  console.info = (message?: unknown) => { lines.push(String(message)); };

  try {
    auditLog({ area: "renewal", action: "query", status: "started", entityId: "client_1", metadata: { xrayClientId: "client_1" } });
  } finally {
    console.info = originalInfo;
    console.log = originalLog;
  }

  assert.equal(lines.length, 1);
  assert.match(lines[0], /renewal\.query\.started/);
  assert.match(lines[0], /"area":"renewal"/);
  assert.match(lines[0], /"action":"query"/);
  assert.match(lines[0], /"status":"started"/);
  assert.match(lines[0], /"entityId":"client_1"/);
});
