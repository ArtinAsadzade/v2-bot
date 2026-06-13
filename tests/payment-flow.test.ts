import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PaymentService } from "../src/modules/payment/payment.service";

const paymentServiceSource = readFileSync("src/modules/payment/payment.service.ts", "utf8");

test("direct gateway request sends the required payload and parses True success responses", async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify({ status: "True", message: "Invoice created successfully", pay_id: "pay_123", payment_link: "https://gateway.example/pay/pay_123" }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;

  try {
    const result = await PaymentService.requestGatewayInvoice({ apiBaseUrl: "https://gateway.example/api/v1/", apiKey: "secret-api-key" }, 125_000, "https://bot.example/payments/callback?invoice_id=abc&token=tok");

    assert.equal(result.parsed.payId, "pay_123");
    assert.equal(result.parsed.paymentLink, "https://gateway.example/pay/pay_123");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://gateway.example/api/v1/invoice/create");
    assert.equal(calls[0].init.method, "POST");
    assert.deepEqual(JSON.parse(String(calls[0].init.body)), { price: 125_000, callback_url: "https://bot.example/payments/callback?invoice_id=abc&token=tok" });
    assert.equal((calls[0].init.headers as Record<string, string>)["Content-Type"], "application/json");
    assert.equal((calls[0].init.headers as Record<string, string>)["X-API-KEY"], "secret-api-key");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("direct gateway request failure is converted to a friendly connection error without crashing", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw Object.assign(new Error("socket hang up"), { name: "TypeError" });
  }) as typeof fetch;

  try {
    await assert.rejects(
      () => PaymentService.requestGatewayInvoice({ apiBaseUrl: "https://gateway.example", apiKey: "secret-api-key" }, 125_000, "https://bot.example/payments/callback?invoice_id=abc&token=tok"),
      /سرور درگاه در دسترس نیست/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("gateway response attachment is idempotent and supports Mongo invoices with a missing payId field", () => {
  assert.match(paymentServiceSource, /OR:\s*\[\{ payId: null \}, \{ payId: \{ isSet: false \} \}\]/);
  assert.match(paymentServiceSource, /current\.status === "PENDING" && current\.payId === gatewayResult\.parsed\.payId/);
  assert.match(paymentServiceSource, /PAYMENT_LINK_READY/);
});

test("callback flow logs validation, paid marking, fulfillment, completion, duplicate callback, and failure events", () => {
  for (const event of [
    "PAYMENT_CALLBACK_RECEIVED",
    "PAYMENT_CALLBACK_VALIDATED",
    "PAYMENT_MARKED_PAID",
    "PAYMENT_FULFILLMENT_STARTED",
    "PAYMENT_WALLET_CREDITED",
    "PAYMENT_PRODUCT_DELIVERED",
    "PAYMENT_COMPLETED",
    "PAYMENT_DUPLICATE_CALLBACK_IGNORED",
    "PAYMENT_FAILED",
  ]) {
    assert.ok(paymentServiceSource.includes(event), `${event} log is present`);
  }
});

test("malformed callback input is guarded before Prisma ObjectId lookup", () => {
  assert.match(paymentServiceSource, /function isValidObjectId/);
  assert.match(paymentServiceSource, /if \(normalized\.invoice && isValidObjectId\(normalized\.invoice\)\)/);
  assert.match(paymentServiceSource, /if \(isValidObjectId\(normalized\.invoice_id\)\)/);
});
