import { describe, expect, test } from "vitest";
import { redactPaymentMetadata, safePaymentCallbackUrl } from "../src/modules/payment/payment-redaction";

describe("payment callback redaction", () => {
  test("redacts sensitive callback parameters", () => {
    expect(redactPaymentMetadata({ token: "secret", nested: { authority: "auth", ok: "visible" } })).toEqual({
      token: "[REDACTED]",
      nested: { authority: "[REDACTED]", ok: "visible" },
    });
  });

  test("does not log full callback URLs", () => {
    expect(safePaymentCallbackUrl("/payments/callback?token=secret&invoice_id=abc")).toBe("/payments/callback?[REDACTED]");
  });
});
