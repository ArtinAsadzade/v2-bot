import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";

const payment = (fs.readFileSync("src/modules/payment/payment.service.ts", "utf8") + "\n" + fs.readFileSync("src/modules/payment/payment.types.ts", "utf8") + "\n" + fs.readFileSync("src/modules/payment/payment-fulfillment.service.ts", "utf8") + "\n" + fs.readFileSync("src/modules/payment/payment-delivery.service.ts", "utf8") + "\n" + fs.readFileSync("src/modules/payment/payment-callback.service.ts", "utf8") + "\n" + fs.readFileSync("src/modules/payment/wallet-payment.service.ts", "utf8") + "\n" + fs.readFileSync("src/modules/payment/gateway-payment.service.ts", "utf8") + "\n" + fs.readFileSync("src/modules/payment/payment-discount.service.ts", "utf8") + "\n" + fs.readFileSync("src/modules/payment/payment-notification.service.ts", "utf8") + "\n" + fs.readFileSync("src/modules/payment/payment-repository.ts", "utf8"));
const rateLimit = fs.readFileSync("src/bot/middlewares/rate-limit.middleware.ts", "utf8");
const modern = (fs.readFileSync("src/bot/handlers/modern/register-modern-handlers.ts", "utf8") + "\n" + fs.readFileSync("src/bot/handlers/modern/navigation.handlers.ts", "utf8") + "\n" + fs.readFileSync("src/bot/handlers/modern/home.handlers.ts", "utf8") + "\n" + fs.readFileSync("src/bot/handlers/modern/product.handlers.ts", "utf8") + "\n" + fs.readFileSync("src/bot/handlers/modern/purchase.handlers.ts", "utf8") + "\n" + fs.readFileSync("src/bot/handlers/modern/wallet.handlers.ts", "utf8") + "\n" + fs.readFileSync("src/bot/handlers/modern/coupon.handlers.ts", "utf8") + "\n" + fs.readFileSync("src/bot/handlers/modern/account.handlers.ts", "utf8") + "\n" + fs.readFileSync("src/bot/handlers/modern/xray.handlers.ts", "utf8") + "\n" + fs.readFileSync("src/bot/handlers/modern/free-account.handlers.ts", "utf8") + "\n" + fs.readFileSync("src/bot/handlers/modern/support.handlers.ts", "utf8") + "\n" + fs.readFileSync("src/bot/handlers/modern/admin.handlers.ts", "utf8") + "\n" + fs.readFileSync("src/bot/handlers/modern/admin/index.ts", "utf8") + "\n" + fs.readFileSync("src/bot/handlers/modern/admin/admin-products.handlers.ts", "utf8") + "\n" + fs.readFileSync("src/bot/handlers/modern/admin/admin-payments.handlers.ts", "utf8") + "\n" + fs.readFileSync("src/bot/handlers/modern/admin/admin-coupons.handlers.ts", "utf8") + "\n" + fs.readFileSync("src/bot/handlers/modern/admin/admin-inventory.handlers.ts", "utf8") + "\n" + fs.readFileSync("src/bot/handlers/modern/admin/admin-settings.handlers.ts", "utf8") + "\n" + fs.readFileSync("src/bot/handlers/modern/admin/admin-support.handlers.ts", "utf8") + "\n" + fs.readFileSync("src/bot/handlers/modern/admin/admin-users.handlers.ts", "utf8") + "\n" + fs.readFileSync("src/bot/messages/coupon.messages.ts", "utf8") + "\n" + fs.readFileSync("src/bot/messages/purchase.messages.ts", "utf8") + "\n" + fs.readFileSync("src/bot/callbacks/index.ts", "utf8") + "\n" + fs.readFileSync("src/bot/keyboards/purchase.keyboard.ts", "utf8") + "\n" + fs.readFileSync("src/bot/messages/coupon.messages.ts", "utf8") + "\n" + fs.readFileSync("src/bot/messages/purchase.messages.ts", "utf8") + "\n" + fs.readFileSync("src/bot/callbacks/index.ts", "utf8") + "\n" + fs.readFileSync("src/bot/keyboards/purchase.keyboard.ts", "utf8"));
const cleaner = fs.readFileSync("src/jobs/purchaseCleaner.ts", "utf8");
const views = (fs.readFileSync("src/bot/views/modern.views.ts", "utf8") + "\n" + fs.readFileSync("src/bot/views/home.views.ts", "utf8") + "\n" + fs.readFileSync("src/bot/views/product.views.ts", "utf8") + "\n" + fs.readFileSync("src/bot/views/purchase.views.ts", "utf8") + "\n" + fs.readFileSync("src/bot/views/account.views.ts", "utf8") + "\n" + fs.readFileSync("src/bot/views/wallet.views.ts", "utf8") + "\n" + fs.readFileSync("src/bot/views/support.views.ts", "utf8") + "\n" + fs.readFileSync("src/bot/views/free-account.views.ts", "utf8") + "\n" + fs.readFileSync("src/bot/views/admin.views.ts", "utf8"));

test("pending product purchase intent resolves to reusable invoice, processing, expired, or none", () => {
  assert.match(payment, /resolveExistingPurchaseIntent\(userId: string, productId: string\)/);
  assert.match(payment, /action: "reuse_invoice"/);
  assert.match(payment, /paymentLink/);
  assert.match(payment, /action: "processing"/);
  assert.match(payment, /action: "expired_and_released"/);
  assert.match(payment, /PURCHASE_PENDING_TTL_SECONDS/);
  assert.match(payment, /INVOICE_PENDING_TTL_SECONDS/);
});

test("purchase UI resumes invoices and offers cancel/back instead of dead-end errors", () => {
  assert.match(modern, /Pay previous invoice/);
  assert.match(modern, /Cancel and create new invoice/);
  assert.match(modern, /Cancel stuck purchase/);
  assert.match(modern, /Your previous purchase request expired/);
});

test("wallet top-up has a short configurable rate limit with remaining seconds", () => {
  assert.match(rateLimit, /WALLET_TOPUP_RATE_LIMIT_SECONDS/);
  assert.match(rateLimit, /wallet_topup/);
  assert.match(rateLimit, /remainingSeconds/);
});

test("admin order displays and invoice stats use paid/final amounts", () => {
  assert.match(payment, /_sum: \{ amount: true \}/);
  assert.match(views, /money\(order\.finalPaidAmount\)/);
});

test("discount usage is confirmed after successful completion and is idempotent by order", () => {
  assert.match(payment, /confirmCouponUsage/);
  assert.match(payment, /existingForOrder/);
  assert.match(payment, /COUPON_USAGE_RECORDED/);
  assert.doesNotMatch(payment, /couponUpdated[\s\S]{0,800}const order = await tx\.order\.create/);
});

test("instant product invoice uses discounted final amount", () => {
  assert.match(payment, /amount: quote\.finalAmount/);
  assert.match(payment, /originalAmount: quote\.originalAmount/);
  assert.match(payment, /discountAmount: quote\.discountAmount/);
  assert.match(payment, /price: data\.amount/);
});

test("stale pending purchases and invoices are cleaned without counting discounts", () => {
  assert.match(cleaner, /cleanStalePurchases/);
  assert.match(cleaner, /status: "EXPIRED"/);
  assert.match(cleaner, /releaseExpiredReservations\(Math\.ceil/);
  assert.match(cleaner, /orphaned_panel_client/);
  assert.doesNotMatch(cleaner, /couponUsage\.create/);
});
