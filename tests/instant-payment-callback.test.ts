import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const paymentServiceSource = readFileSync("src/modules/payment/payment.service.ts", "utf8");
const callbackServerSource = readFileSync("src/services/payment-callback-server.ts", "utf8");

test("instant gateway callback url always carries the internal invoice id", () => {
  assert.match(paymentServiceSource, /url\.searchParams\.set\(CALLBACK_INVOICE_PARAM, data\.invoiceId\)/);
  assert.match(paymentServiceSource, /const invoice = await prisma\.paymentInvoice\.create/);
  assert.match(paymentServiceSource, /const callbackUrl = invoiceCallbackUrl\(gateway\.callbackUrl, \{ invoiceId: invoice\.id/);
  assert.match(paymentServiceSource, /callback_url: callbackUrl/);
});

test("gateway callback endpoint accepts documented api route and resolves invoice_id safely", () => {
  assert.match(callbackServerSource, /"\/api\/payment\/callback"/);
  assert.match(callbackServerSource, /invoice_id: url\.searchParams\.get\("invoice_id"\)/);
  assert.match(paymentServiceSource, /if \(isValidObjectId\(normalized\.invoice_id\)\)/);
  assert.match(paymentServiceSource, /reason: "missing_callback_reference"/);
});

test("instant callback delivery is idempotent but failed paid deliveries can be retried", () => {
  assert.match(paymentServiceSource, /deliveryRetryable = invoice\.status === "PAID"/);
  assert.match(paymentServiceSource, /invoice\.deliveryStatus === "FAILED_DELIVERY"/);
  assert.match(paymentServiceSource, /PAYMENT_DUPLICATE_CALLBACK_IGNORED/);
  assert.match(paymentServiceSource, /deliveryStatus: \{ in: \["PENDING", "FAILED", "FAILED_DELIVERY"\] \}/);
  assert.match(paymentServiceSource, /data: \{ deliveryStatus: "PROCESSING" \}/);
});

test("paid product invoices use the same delivery pipeline as wallet purchases and notify failures", () => {
  assert.match(paymentServiceSource, /purchaseProduct\(tx, \{ userId: fresh\.userId, productId: fresh\.productId \?\? "", couponCode: fresh\.couponCode \?\? undefined, method: "INSTANT", invoice: fresh \}\)/);
  assert.match(paymentServiceSource, /if \(\(result as any\)\.needsXrayProvisioning/);
  assert.match(paymentServiceSource, /PAYMENT_DELIVERY_FAILED/);
  assert.match(callbackServerSource, /پرداخت ثبت شد اما تحویل ناموفق بود/);
});
