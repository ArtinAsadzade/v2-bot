# Refactor Phase 3b Payment Orchestration Report

## Scope

Continued Phase 3 payment cleanup by extracting wallet purchase facade logic and instant payment callback orchestration out of `src/modules/payment/payment.service.ts` while preserving the public `PaymentService` API.

## Line count

- Old `payment.service.ts` line count: 2378 lines.
- New `payment.service.ts` line count: 1986 lines.
- Net reduction: 392 lines.

## Files created

- `src/modules/payment/payment-callback.service.ts`
- `src/modules/payment/wallet-payment.service.ts`
- `src/modules/payment/payment-logging.ts`
- `docs/refactor-phase-3b-payment-orchestration-report.md`

## Files changed

- `src/modules/payment/payment.service.ts`

## Methods moved

### `payment-callback.service.ts`

Moved the instant payment callback orchestration behind `PaymentCallbackService.completePayment`:

- callback reference normalization for `invoice_id`, `token`, `invoice`, and `pay_id`
- invoice lookup from callback reference
- callback count and last callback timestamp update
- invoice amount integrity handling
- callback `pay_id` mismatch and duplicate `pay_id` checks
- duplicate callback idempotency branch
- pending invoice `PAID` transition
- fulfillment lock acquisition
- fulfillment success/failure callback response shaping

### `wallet-payment.service.ts`

Moved wallet payment facade orchestration behind `WalletPaymentService.purchaseProductWithWallet`:

- wallet purchase error handling
- coupon recheck failure logging branch
- purchase failure monitoring branch
- dashboard cache invalidation
- order and coupon event emission after wallet success

### `payment-logging.ts`

Moved the shared `paymentLog` helper to remove callback/wallet imports from the large facade and avoid service cycles.

## Public API preserved

- `PaymentService.completePayment(reference, metadata)` remains the public callback entry point and delegates to `PaymentCallbackService`.
- `PaymentService.purchaseProductWithWallet(userId, productId, couponCode)` remains the public wallet purchase entry point and delegates to `WalletPaymentService`.
- Existing exported payment types from `payment.service.ts` remain exported.
- `PaymentService.requestGatewayInvoice` remains a static facade.

## Behavior preservation notes

- Callback query parameter support for `invoice_id` and `token` is preserved, including legacy `invoice`, legacy token lookup through `invoice_id`, and `pay_id` fallback.
- Duplicate callback behavior still returns the existing completed result and does not re-acquire fulfillment if the invoice is already completed or locked.
- Fulfillment lock filters were moved unchanged.
- Wallet deduction timing is still inside the existing product purchase/finalization path; the wallet facade only delegates after the same validation path.
- Discount final amount and coupon confirmation timing remain in existing purchase fulfillment code.
- X-UI/3x-ui provisioning and delivery state machine remain in `payment.service.ts`.
- Callback failure handling still keeps paid invoices paid and marks delivery as `FAILED_DELIVERY`.

## Risky blocks left untouched

- Product delivery state machine and inventory reservation flow.
- Wallet debit transaction creation/update internals.
- Coupon usage confirmation transaction internals.
- Xray/x-ui provisioning, verification, cleanup, and delivery semantics.
- Gateway invoice creation and callback URL construction.
- Prisma schema and indexes.

## Validation results

- `npm run build`: passed.
- `npx tsc --noEmit`: passed.
- `npx prisma generate`: passed.
- `git diff --check`: passed.
- `npx prisma validate`: skipped because `DATABASE_URL` was not present in the environment.

## Manual QA checklist

Run these scenarios in staging before release:

- Wallet purchase success.
- Wallet insufficient balance.
- Wallet duplicate click.
- Instant invoice create.
- Instant callback success.
- Duplicate instant callback.
- Payment callback with invalid invoice.
- Coupon wallet purchase.
- Coupon instant payment.
- Admin income after discounted payment.
- My accounts after payment.

## Next recommended phase

Continue Phase 3 with a fulfillment-only extraction once callback and wallet flows are stable in staging. The next safest target is a `payment-fulfillment.service.ts` that receives explicit dependencies for product delivery and Xray provisioning, keeping all Prisma filters and delivery status transitions byte-for-byte equivalent.
