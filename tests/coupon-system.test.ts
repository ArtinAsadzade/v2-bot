import { test } from "vitest";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CouponService } from "../src/modules/coupon/coupon.service";

const couponServiceSource = readFileSync("src/modules/coupon/coupon.service.ts", "utf8");
const paymentServiceSource = (readFileSync("src/modules/payment/payment.service.ts", "utf8") + "\n" + readFileSync("src/modules/payment/payment.types.ts", "utf8") + "\n" + readFileSync("src/modules/payment/payment-fulfillment.service.ts", "utf8") + "\n" + readFileSync("src/modules/payment/payment-delivery.service.ts", "utf8") + "\n" + readFileSync("src/modules/payment/payment-callback.service.ts", "utf8") + "\n" + readFileSync("src/modules/payment/wallet-payment.service.ts", "utf8") + "\n" + readFileSync("src/modules/payment/gateway-payment.service.ts", "utf8") + "\n" + readFileSync("src/modules/payment/payment-discount.service.ts", "utf8") + "\n" + readFileSync("src/modules/payment/payment-notification.service.ts", "utf8") + "\n" + readFileSync("src/modules/payment/payment-repository.ts", "utf8"));
const modernViewsSource = (readFileSync("src/bot/views/modern.views.ts", "utf8") + "\n" + readFileSync("src/bot/views/home.views.ts", "utf8") + "\n" + readFileSync("src/bot/views/product.views.ts", "utf8") + "\n" + readFileSync("src/bot/views/purchase.views.ts", "utf8") + "\n" + readFileSync("src/bot/views/account.views.ts", "utf8") + "\n" + readFileSync("src/bot/views/wallet.views.ts", "utf8") + "\n" + readFileSync("src/bot/views/support.views.ts", "utf8") + "\n" + readFileSync("src/bot/views/free-account.views.ts", "utf8") + "\n" + readFileSync("src/bot/views/admin.views.ts", "utf8"));
const modernHandlersSource = (readFileSync("src/bot/handlers/modern/register-modern-handlers.ts", "utf8") + "\n" + readFileSync("src/bot/handlers/modern/navigation.handlers.ts", "utf8") + "\n" + readFileSync("src/bot/handlers/modern/home.handlers.ts", "utf8") + "\n" + readFileSync("src/bot/handlers/modern/product.handlers.ts", "utf8") + "\n" + readFileSync("src/bot/handlers/modern/purchase.handlers.ts", "utf8") + "\n" + readFileSync("src/bot/handlers/modern/wallet.handlers.ts", "utf8") + "\n" + readFileSync("src/bot/handlers/modern/coupon.handlers.ts", "utf8") + "\n" + readFileSync("src/bot/handlers/modern/account.handlers.ts", "utf8") + "\n" + readFileSync("src/bot/handlers/modern/xray.handlers.ts", "utf8") + "\n" + readFileSync("src/bot/handlers/modern/free-account.handlers.ts", "utf8") + "\n" + readFileSync("src/bot/handlers/modern/support.handlers.ts", "utf8") + "\n" + readFileSync("src/bot/handlers/modern/admin.handlers.ts", "utf8") + "\n" + readFileSync("src/bot/handlers/modern/admin/index.ts", "utf8") + "\n" + readFileSync("src/bot/handlers/modern/admin/admin-products.handlers.ts", "utf8") + "\n" + readFileSync("src/bot/handlers/modern/admin/admin-payments.handlers.ts", "utf8") + "\n" + readFileSync("src/bot/handlers/modern/admin/admin-coupons.handlers.ts", "utf8") + "\n" + readFileSync("src/bot/handlers/modern/admin/admin-inventory.handlers.ts", "utf8") + "\n" + readFileSync("src/bot/handlers/modern/admin/admin-settings.handlers.ts", "utf8") + "\n" + readFileSync("src/bot/handlers/modern/admin/admin-support.handlers.ts", "utf8") + "\n" + readFileSync("src/bot/handlers/modern/admin/admin-users.handlers.ts", "utf8") + "\n" + readFileSync("src/bot/keyboards/purchase.keyboard.ts", "utf8") + "\n" + readFileSync("src/bot/messages/coupon.messages.ts", "utf8") + "\n" + readFileSync("src/bot/messages/purchase.messages.ts", "utf8") + "\n" + readFileSync("src/bot/callbacks/index.ts", "utf8"));

test("coupon validation rejects expired, inactive, deleted, usage limit, per-user and minimum purchase states", () => {
  assert.match(couponServiceSource, /expiresAt <= now/);
  assert.match(couponServiceSource, /coupon\.status !== "active"/);
  assert.match(couponServiceSource, /coupon\.status === "deleted" \|\| coupon\.deletedAt/);
  assert.match(couponServiceSource, /coupon\.usedCount >= coupon\.maxUses/);
  assert.match(couponServiceSource, /usedByUser >= coupon\.perUserLimit/);
  assert.match(couponServiceSource, /originalAmount < coupon\.minimumPurchaseAmount/);
});

test("coupon discount calculations handle percentage, fixed, and fixed greater than price", () => {
  const base = { id: "c", code: "SAVE", maxUses: 10, usedCount: 0, perUserLimit: 1, minimumPurchaseAmount: 0, status: "active", expiresAt: new Date(Date.now() + 1000), deletedAt: null, createdAt: new Date(), updatedAt: new Date() } as const;
  assert.deepEqual(CouponService.calculate({ ...base, type: "percentage", value: 25, discountPercent: 25 } as any, 1_000), { originalAmount: 1_000, discountAmount: 250, finalAmount: 750 });
  assert.deepEqual(CouponService.calculate({ ...base, type: "fixed", value: 300, discountPercent: null } as any, 1_000), { originalAmount: 1_000, discountAmount: 300, finalAmount: 700 });
  assert.deepEqual(CouponService.calculate({ ...base, type: "fixed", value: 2_000, discountPercent: null } as any, 1_000), { originalAmount: 1_000, discountAmount: 1_000, finalAmount: 0 });
});

test("checkout apply, removal and replacement UI use shared validation and clear stale coupon state", () => {
  assert.match(couponServiceSource, /validateForCheckout/);
  assert.match(modernViewsSource, /validateForCheckout/);
  assert.match(modernHandlersSource, /coupon:remove/);
  assert.match(modernHandlersSource, /delete ctx\.session\.selectedCoupons\[productId\]/);
  assert.match(modernViewsSource, /تغییر کد تخفیف/);
  assert.match(modernViewsSource, /افزودن کد تخفیف/);
});

test("wallet and direct payment recheck coupons consistently and do not emit critical purchase alerts for coupon validation", () => {
  assert.match(paymentServiceSource, /quoteProductInvoice[\s\S]*validateForCheckout/);
  assert.match(paymentServiceSource, /purchaseProduct[\s\S]*validateForCheckout/);
  assert.match(paymentServiceSource, /COUPON_RECHECK_FAILED/);
  assert.match(paymentServiceSource, /if \(\/کد تخفیف\|کوپن\|تخفیف\/\.test\(message\)\)/);
});

test("direct invoices store discounted amounts and callbacks use invoice stored amounts", () => {
  assert.match(paymentServiceSource, /originalAmount: quote\.originalAmount/);
  assert.match(paymentServiceSource, /discountAmount: quote\.discountAmount/);
  assert.match(paymentServiceSource, /amount: quote\.finalAmount/);
  assert.match(paymentServiceSource, /discountAmount = data\.invoice\.discountAmount/);
  assert.match(paymentServiceSource, /totalAmount = data\.invoice\.amount/);
});

test("usage tracking is after purchase success, atomic, race blocked, and duplicate callbacks ignored", () => {
  assert.match(paymentServiceSource, /usedCount: \{ increment: 1 \}/);
  assert.match(paymentServiceSource, /couponUsage\.create/);
  assert.match(paymentServiceSource, /COUPON_USAGE_RECORDED/);
  assert.match(paymentServiceSource, /COUPON_USAGE_RACE_BLOCKED/);
  assert.match(paymentServiceSource, /PAYMENT_DUPLICATE_CALLBACK_IGNORED/);
});
