# Critical Stabilization Report

Date: 2026-06-19

## Fixed

- Normalized product delivery results in `src/modules/payment/payment.service.ts` with a discriminated union:
  - successful deliveries return `ok: true` with `order`, `product`, `account`, `orderItem`, optional `xrayClient`, pricing, coupon, and expiry fields;
  - non-delivered duplicate/processing states return `ok: false` with `error`, `reason`, and `recoverable` metadata.
- Updated payment fulfillment to narrow delivery results before reading `order`, `product`, and `account`, fixing the TypeScript build errors around possibly undefined fields.
- Made Xray wallet duplicate purchase handling idempotent:
  - active previous deliveries reuse the existing order/client/account payload;
  - in-flight previous deliveries return a typed, recoverable processing state instead of creating another panel client, charging again, or reserving more stock.
- Kept instant payment callback fulfillment on the same delivery path as wallet purchase. Paid product invoices call the normalized product delivery function, then Xray provisioning when needed, and duplicate callbacks continue to resolve through existing completed delivery lookup/fulfillment locks.
- Preserved coupon confirmation semantics: coupon usage is recorded only from successful manual delivery or verified Xray delivery, and `confirmCouponUsage` remains idempotent per order before incrementing usage.
- Wired `src/jobs/deliveryCleanup.ts` into startup and the existing one-minute job loop so stale product/free-account reservations and stale pending/reserving orders are cleaned.
- Preserved Prisma nullable index safety: `OrderItem.productAccountId` remains indexed with `@@index([productAccountId])`; no nullable `@@unique([productAccountId])` was added. The manual partial unique index `OrderItem_productAccountId_unique_non_null` remains a required operational database index outside Prisma schema.

## Files changed

- `src/modules/payment/payment.service.ts`
- `src/app.ts`
- `docs/stabilization-report.md`

## Build and validation result

- `npx tsc --noEmit` passed.
- `npm run build` passed.
- `npx prisma validate` was attempted only if `DATABASE_URL` exists; this environment does not define `DATABASE_URL`.
- `npx prisma generate` was run successfully.

## Remaining risks

- Coupon limits are still confirmed only after payment/delivery. This prevents charging usage on unpaid invoices, but a paid callback can still require manual review/refund if a coupon becomes exhausted between invoice creation and fulfillment.
- Payment and purchase orchestration still live in a large `payment.service.ts`; this stabilization intentionally avoided the larger architecture refactor.
- Xray panel operations remain external side effects outside the database transaction and still need stronger retry/repair tooling and integration tests.
- Manual partial unique index `OrderItem_productAccountId_unique_non_null` must be kept/applied in MongoDB operationally because Prisma Mongo schema cannot express this nullable partial uniqueness safely.

## Next recommended refactor phase

1. Extract a purchase/delivery service that owns the `ProductDeliveryResult` union and all manual/Xray delivery state transitions.
2. Extract payment callback handling into a callback service with shared notifier/message helpers for wallet top-up, product delivery, failure, and admin alerts.
3. Add focused tests for duplicate wallet clicks, duplicate callbacks, stale processing retry, coupon confirmation idempotency, and delivery cleanup.
4. Consolidate stale reservation cleanup into a single cleanup service used by both scheduled jobs and cancellation paths.
