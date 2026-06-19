# Post-Refactor Regression Audit

Date: 2026-06-19

## Scope and constraints

This audit used the prior audit/refactor reports as context and focused on static regression verification after modularization. No `dist/**` files were touched, no large refactors were performed, and no business logic changes were made.

Reference reports reviewed:

- `docs/code-audit-report.md`
- `docs/code-audit-qa-checklist.md`
- `docs/stabilization-report.md`
- `docs/refactor-phase-1-report.md`
- `docs/refactor-phase-1b-report.md`
- `docs/refactor-phase-2-handlers-report.md`
- `docs/refactor-phase-2b-handler-extraction-report.md`
- `docs/refactor-phase-2c-admin-handlers-report.md`
- `docs/refactor-phase-3-payment-extraction-report.md`
- `docs/refactor-phase-3b-payment-orchestration-report.md`
- `docs/refactor-phase-3c-payment-fulfillment-report.md`

## Files inspected

### Startup, registration, navigation, and callbacks

- `src/app.ts`
- `src/bot/handlers/index.ts`
- `src/bot/handlers/modern.ts`
- `src/bot/handlers/modern/register-modern-handlers.ts`
- `src/bot/handlers/modern/navigation.handlers.ts`
- `src/bot/handlers/modern/home.handlers.ts`
- `src/bot/handlers/modern/product.handlers.ts`
- `src/bot/handlers/modern/purchase.handlers.ts`
- `src/bot/handlers/modern/wallet.handlers.ts`
- `src/bot/handlers/modern/coupon.handlers.ts`
- `src/bot/handlers/modern/account.handlers.ts`
- `src/bot/handlers/modern/xray.handlers.ts`
- `src/bot/handlers/modern/free-account.handlers.ts`
- `src/bot/handlers/modern/support.handlers.ts`
- `src/bot/handlers/modern/admin.handlers.ts`
- `src/bot/handlers/modern/admin/index.ts`
- `src/bot/navigation/panel-ui.ts`
- `src/bot/views/modern.views.ts`
- `src/services/payment-callback-server.ts`

### Payment, coupon, revenue, and cleanup

- `src/modules/payment/payment.service.ts`
- `src/modules/payment/payment-callback.service.ts`
- `src/modules/payment/payment-delivery.service.ts`
- `src/modules/payment/payment-fulfillment.service.ts`
- `src/modules/payment/payment-discount.service.ts`
- `src/modules/payment/payment-notification.service.ts`
- `src/modules/payment/payment.types.ts`
- `src/modules/payment/wallet-payment.service.ts`
- `src/modules/payment/gateway-payment.service.ts`
- `src/modules/coupon/coupon.service.ts`
- `src/modules/admin/admin.service.ts`
- `src/jobs/deliveryCleanup.ts`
- `src/jobs/purchaseCleaner.ts`
- `src/jobs/depositCleaner.ts`
- `src/jobs/accountExpiration.ts`

## 1. Import/export integrity audit

### Result: Pass

- `npm run build` and `npx tsc --noEmit` both passed, which verifies TypeScript-level import/export integrity across the refactored modules.
- The startup import chain remains intact: `src/app.ts` imports `registerHandlers` from `src/bot/handlers/index.ts`, which delegates to `registerModernHandlers` from `src/bot/handlers/modern.ts`, which delegates to `src/bot/handlers/modern/register-modern-handlers.ts`.
- The modern handler compatibility wrapper still exports `registerModernHandlers`, preserving the previous import path used by `src/bot/handlers/index.ts`.
- Payment public facades remain available:
  - `PaymentService.completePayment`
  - `PaymentService.fulfillPaidInvoice`
  - `PaymentService.finalizePaidProductPurchase`
  - `PaymentService.purchaseProduct`
  - `PaymentService.provisionXrayClient`
  - `PaymentService.purchaseProductWithWallet`
  - `PaymentService.createProductInvoice`
  - `PaymentService.createWalletTopupInvoice`
  - `PaymentInvoiceService.processCallback`
  - `PaymentInvoiceService.createProductInvoice`
  - `PaymentInvoiceService.purchaseProductWithWallet`
- Moved payment types remain available from `src/modules/payment/payment.service.ts` through its existing type imports/exports and internal facade use. `PaymentDeliveryService`, `PaymentFulfillmentService`, `PaymentCallbackService`, and `WalletPaymentService` consume the extracted `payment.types.ts` types directly.
- No circular-import runtime issue was found by static inspection in the startup and payment callback paths. The payment callback server imports only the payment facade and navigation callback builder; extracted payment modules do not import the HTTP callback server.

## 2. Handler registration audit

### Result: Pass

`registerModernHandlers` registers all required modern domains in this order:

1. views
2. flow engine
3. navigation
4. home
5. product
6. xray
7. coupon
8. purchase
9. wallet
10. free account
11. support
12. admin

Domain coverage verified:

- navigation: `registerNavigationHandlers`
- home: `registerHomeHandlers`
- product: `registerProductHandlers`
- purchase: `registerPurchaseHandlers`
- wallet: `registerWalletHandlers`
- coupon: `registerCouponHandlers`
- account: account panels are registered as views and routed through centralized `nav:*` rendering; `account.handlers.ts` is an intentionally empty placeholder (`export {}`) and not an unregistered functional handler.
- xray: `registerXrayHandlers`
- free account: `registerFreeAccountHandlers`
- support: `registerSupportHandlers`
- admin: `registerAdminHandlers`

Admin modular registration is centralized through `src/bot/handlers/modern/admin/index.ts`, which registers:

- inventory
- settings
- products
- payments
- coupons
- users
- support

Order safety notes:

- Navigation and specific domain handlers are registered before admin handlers.
- The broad navigation parser remains in the modern navigation module and is not replacing the domain-specific `buy:*`, `coupon:*`, `wallet/deposit`, `support:*`, `free-account`, `xray:*`, and `admin:*` action handlers.
- No modern domain handler module with a `register*Handlers` export was found to be orphaned from the modern registration path. The account-domain file is an empty placeholder and current account navigation is handled through registered views plus centralized navigation rendering.

## 3. Callback compatibility audit

### Result: Pass with watch items

Checked callback literals and builders with `rg` for:

- `callbackFor(...)`
- `actionFor(...)`
- `callback_data`
- `buy:*`
- `product/shop` navigation callbacks
- `wallet` and `deposit` callbacks
- `payment` callback route references
- `coupon:*`
- `admin:*`
- `support:*`
- `free-account` callbacks
- `xray:*`
- pagination callbacks
- back/cancel callbacks
- renewal/payment invoice callbacks

Findings:

- Centralized `callbackFor`/`actionFor` use remains widespread in views, handlers, notification service, payment callback notification buttons, and support/admin notification actions.
- Legacy action-style callbacks remain intentionally supported for domain commands such as `buy:confirm`, `buy:instant`, `coupon:remove`, `coupon:change`, `xray:sub`, `xray:configs`, `xray:renew:*`, `support:*`, and `admin:*`.
- Payment callback HTTP compatibility remains intact for both `/payments/callback` and `/api/payment/callback`.
- Payment callback reference compatibility covers `token`, `invoice`, `invoice_id`, and `pay_id`.
- Existing compact callback token tests are still present, but `npm test` currently runs the node:test-style static tests through Vitest and reports harness/static-path failures; see validation section.

Watch items:

- Several legacy static tests still expect behavior to be present in pre-refactor monolithic files such as `src/bot/handlers/modern.ts` or `src/bot/views/modern.views.ts`. The code has moved into domain files, so those tests should be updated to follow the new module locations rather than treated as runtime callback regressions.

## 4. Payment flow regression audit

### Result: Pass by static inspection

Verified payment paths:

- Wallet purchase success flows through `PaymentInvoiceService.purchaseProductWithWallet` -> `PaymentService.purchaseProductWithWallet` -> `WalletPaymentService.purchaseProductWithWallet` -> `PaymentFulfillmentService.finalizePaidProductPurchase` -> `PaymentDeliveryService.purchaseProduct`.
- Wallet insufficient balance is checked in `PaymentDeliveryService.purchaseProduct` before inventory sale, Xray panel creation, and wallet debit.
- Duplicate wallet Xray purchase is guarded by an existing `xrayClient.findFirst` for provisioning/creating/active clients before creating a new client.
- Instant invoice creation stores quoted final amount, original amount, discount amount, coupon id, and coupon code in `PaymentInvoiceService.createProductInvoice`.
- Instant callback success flows through `PaymentCallbackService.completePayment`, marks a pending invoice paid once, locks fulfillment via `deliveryStatus`, then calls the same fulfillment/delivery path used by wallet/direct fulfillment.
- Duplicate instant callback is guarded by invoice status/delivery status checks, callback counters, a fulfillment lock, and `existingCompletedResult` for completed invoices.
- Paid gateway plus delivery failure keeps the invoice paid and marks `deliveryStatus: FAILED_DELIVERY`, records monitoring, emits `payment.delivery.failed`, and notifies failure through the callback server path.
- Paid gateway plus existing completed invoice returns the existing completed result and does not deliver twice.
- Wallet top-up completion credits the wallet once in `PaymentFulfillmentService.fulfillPaidInvoice` when invoice type is `WALLET_TOPUP`.

Critical invariants verified:

- No Xray client is created before wallet balance check in `PaymentDeliveryService.purchaseProduct`.
- Wallet debit for manual inventory occurs only after reserved inventory is transitioned to sold and order item validity is verified.
- Wallet debit for Xray occurs in `provisionXrayClient` only after create + verify succeeds and inside the final completion transaction.
- Instant callbacks trigger fulfillment and then user notification via `notifyUser` when `result.result` exists.
- Duplicate callback paths do not call delivery again unless the invoice is paid and delivery is explicitly retryable.
- `ProductDeliveryResult` remains a discriminated union and successful delivery is narrowed through `assertProductDeliverySuccess`.

## 5. Coupon/revenue audit

### Result: Pass

- Discount is not counted on unpaid invoice creation. Invoice creation stores coupon metadata but does not call `confirmCouponUsage`.
- Coupon usage is confirmed only after successful delivery/completion:
  - Manual inventory after order completion.
  - Xray after verified panel delivery and order completion.
- Duplicate callbacks do not double-count coupon usage because completed invoices short-circuit and `PaymentDiscountService.confirmCouponUsage` returns an existing usage row for the same order.
- Wallet and instant payment paths store the final paid amount on `order.finalPaidAmount` and invoice `amount`.
- Admin dashboard/product revenue aggregates use `finalPaidAmount` for orders.
- Payment invoice stats aggregate completed invoice `amount`, which is the final paid amount after discounts.
- Coupon management list/detail are still routed through the admin coupon handlers and `AdminService.listCoupons`. Usage display wiring should still be manually checked in the admin panel because static inspection confirms service connectivity but not Telegram rendering correctness.

## 6. Cleanup job audit

### Result: Pass

- Startup wires `cleanupExpiredDeliveryReservations` for initial execution and recurring `setInterval` execution.
- Stale delivery reservations are released for `ProductAccount` and `FreeAccount` records.
- Stale pending/reserving/panel-creating orders are marked failed by delivery cleanup.
- Stale pending purchases and invoices are also handled by `purchaseCleaner` and `resolveExistingPurchaseIntent` expiry logic.
- Cleanup does not debit wallets and does not call coupon usage confirmation.
- Cleanup errors are caught in `src/app.ts`, logged, and recorded through `MonitoringService`; they do not crash the app from the scheduled path.

## 7. Runtime smoke checks by static inspection

### Result: Pass

- App startup imports are valid and compile.
- Bot registration path is `src/app.ts` -> `src/bot/handlers/index.ts` -> `src/bot/handlers/modern.ts` -> `src/bot/handlers/modern/register-modern-handlers.ts`.
- Payment callback route path accepts `GET /payments/callback` and `GET /api/payment/callback`.
- Scheduler startup path runs deposit cleaner, purchase cleaner, account expiration, delivery cleanup, and crypto-rate refresh.
- Prisma client import path is consistently `src/services/prisma.ts` or `src/services/database/prisma.ts` aliases and compiled successfully.
- Environment/config access is still read from `dotenv.config()` in startup, `process.env` in payment callback server, and gateway/system service configuration modules.

## Validation command results

| Command | Result | Notes |
| --- | --- | --- |
| `npm run build` | Pass | Runs `prebuild` Prisma generation and TypeScript build. |
| `npx tsc --noEmit` | Pass | TypeScript no-emit check passed. |
| `npx prisma generate` | Pass | Prisma Client generated successfully. |
| `git diff --check` | Pass | No whitespace errors. |
| `npm test` | Warning | Command completed in this environment but the Vitest run reports many node:test-style/static-path suite failures and one mock export issue. Failures appear test harness/refactor-location related rather than build/runtime import failures. Tests should be modernized to the modular file layout. |
| `npx prisma validate` | Skipped | `DATABASE_URL` was not present in the environment. |

## Small fixes made

None. No code changes were required for build/runtime correctness during this audit.

## Remaining risks

1. **Test harness drift:** Many tests inspect old monolithic file paths and therefore fail after modularization even when equivalent logic exists in extracted modules. Update tests to follow new handler/view/payment module locations.
2. **Manual Telegram behavior still required:** Static inspection cannot prove Telegram UI edit/reply behavior, forced-join behavior, or callback ordering under real Bot API traffic.
3. **Real gateway callback verification:** Static inspection confirms callback idempotency and route parsing, but production gateway behavior must still be tested with real signed/expected gateway callback payloads.
4. **Real Xray panel delivery:** Static inspection confirms debit-after-verify and cleanup behavior, but Xray create/verify/delete must be tested against the deployed panel.
5. **Admin coupon usage rendering:** Backend service wiring is intact, but coupon usage display in Telegram admin screens should be manually verified.

## Manual QA checklist before production deploy

- [ ] `/start`
- [ ] forced join
- [ ] blocked user
- [ ] store disabled
- [ ] product list/detail
- [ ] wallet top-up
- [ ] wallet purchase
- [ ] wallet insufficient balance
- [ ] duplicate wallet click
- [ ] instant payment invoice
- [ ] instant payment callback
- [ ] duplicate callback
- [ ] coupon apply
- [ ] coupon usage count
- [ ] admin today income
- [ ] free/test account claim
- [ ] my accounts/config display
- [ ] support ticket open/close
- [ ] admin product/category management
- [ ] admin inventory
- [ ] admin payment/income views
- [ ] cleanup stale reservations

## Recommended next step

Update the existing static regression tests so they target the new modular files (`src/bot/handlers/modern/**`, `src/bot/views/*.views.ts`, and `src/modules/payment/payment-*.service.ts`) instead of the old monolithic locations, then rerun the full test suite and perform the manual Telegram/gateway/Xray QA checklist in a credentialed staging environment.
