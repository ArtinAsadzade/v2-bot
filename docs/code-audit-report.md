# Source Code Audit and Cleanup/Refactor Report

Date: 2026-06-19  
Scope: `src/**`, `prisma/**`, `scripts/**`, `tests/**`, `package.json`; explicitly excluded `dist/**`, `build/**`, and `node_modules/**`.  
Production logic was not modified.

## 0. Commands and evidence sources used

- `find . -maxdepth 3 -type d -not -path './node_modules*' -not -path './dist*' -not -path './build*'`
- `rg --files -g '!node_modules/**' -g '!dist/**' -g '!build/**'`
- `wc -l $(rg --files src prisma scripts tests docs -g '!dist/**' -g '!build/**' -g '!node_modules/**') | sort -nr | head -60`
- `npm run build` failed on existing TypeScript diagnostics in `src/modules/payment/payment.service.ts`.
- `npx prisma validate` failed because `DATABASE_URL` is not set in the environment.
- `npx ts-prune --version` and `npx depcheck --version` could not install due registry `403 Forbidden`; no dependency changes were made.
- Multiple targeted `rg`/`sed` reads were used for payment, wallet, coupon, jobs, callback, and schema paths.

## 1. Project structure overview

Important folders and files:

- `src/app.ts` — runtime entry point. Loads env, registers handlers, starts Telegram bot, starts payment callback HTTP server, and schedules deposit/purchase/account expiration jobs.
- `src/bot/handlers/**` — Telegram callback/message registration. The active modern router is `src/bot/handlers/modern.ts`; several older handlers and re-export aliases remain.
- `src/bot/views/**` — panel/view render functions. `src/bot/views/modern.views.ts` contains user screens, checkout text, admin pages, invoice pages, coupon pages, and analytics views.
- `src/bot/flows/**` — text/photo multi-step flow engine for admin/product/coupon/deposit/payment gateway/support/broadcast input.
- `src/bot/keyboards/**` — some keyboard factories and design-system helpers. However, many inline keyboards are still embedded in handlers/views.
- `src/bot/middlewares/**` — admin, access-control, forced-join, rate-limit, superadmin middleware.
- `src/bot/navigation/**` — callback/action encoding, tokenization, panel routing, pagination state.
- `src/modules/payment/payment.service.ts` — payment gateway config, gateway invoice creation, wallet/product purchase pipeline, callback processing, Xray renewal, coupon confirmation, invoice listing/statistics. This is the largest and riskiest module.
- `src/modules/product/**` — product catalog, visibility filters, validation, public plan queries, and a thin purchase facade.
- `src/modules/admin/**` — admin dashboard, products, accounts, coupons, system config, Xray admin operations.
- `src/modules/coupon/**` — coupon validation/calculation CRUD.
- `src/modules/free-account/**` and `src/modules/rewards/**` — free/test account claim/config logic.
- `src/modules/deposit/**` and `src/modules/wallet/**` — manual crypto deposit and wallet balance/transaction logic.
- `src/modules/xray/**` — Xray/3x-ui panel API wrapper and helper conversions.
- `src/services/**` — Prisma singleton, logger, notification, monitoring, event bus, payment callback HTTP server, analytics service.
- `src/jobs/**` — scheduled cleanup/expiration jobs. `deliveryCleanup.ts` exists but is not wired into startup.
- `src/scripts/**` and root `scripts/**` — verification/repair/audit operational scripts. Some duplicate script names exist at both roots.
- `prisma/schema.prisma` — MongoDB Prisma schema.
- `tests/**` — Vitest/node tests and source-inspection tests for purchase/payment/callback/Xray/admin flows.
- `docs/**` — existing audit/security notes plus this report.

## 2. Oversized files

| File | Lines | Threshold | Main responsibilities found | Why too large | Suggested split | Risk |
|---|---:|---|---|---|---|---|
| `src/modules/payment/payment.service.ts` | 2541 | 2000+ | Gateway config, invoice create, callback matching/idempotency, wallet top-up, wallet purchase, product inventory reservation, Xray delivery, Xray renewal, coupon confirmation, notification markers, admin invoice listing/stats. | Combines gateways, domain purchasing, wallet accounting, inventory, Xray side effects, schema queries, logging, and audit. Duplicate wrapper class also lives at bottom. Existing TS errors are here. | `payment/gateway.service.ts`, `payment/invoice.repository.ts`, `payment/callback.service.ts`, `purchase/checkout.service.ts`, `purchase/delivery.service.ts`, `purchase/xray-delivery.service.ts`, `wallet/wallet-ledger.service.ts`, `coupon/usage.service.ts`, `payment/invoice-admin.service.ts`. | High |
| `src/bot/views/modern.views.ts` | 2121 | 2000+ | User home/shop/checkout/account screens, admin dashboard/products/accounts/coupons/invoices/gateway/Xray/free-account/support/analytics views, text formatting, inline keyboards, service calls. | Presentation, DB-backed service orchestration, message formatting, and keyboard construction are all inline. Hard to test individual screens. | `bot/views/user/*.views.ts`, `bot/views/admin/*.views.ts`, `bot/messages/*.messages.ts`, `bot/keyboards/*.keyboard.ts`, `bot/view-registry.ts`. | High |
| `src/bot/handlers/modern.ts` | 1689 | 1500+ | Registers all callbacks, start/deep links, wallet/instant purchase, coupons, admin actions, Xray pickers, free account claim, referral, deposit, support. | One callback router owns unrelated domains and embeds duplicate checkout/coupon error keyboards. | `handlers/shop.handlers.ts`, `handlers/payment.handlers.ts`, `handlers/admin/*.handlers.ts`, `handlers/free-account.handlers.ts`, `handlers/xray-admin.handlers.ts`, `handlers/referral.handlers.ts`. Keep only registration composition. | High |
| `src/bot/flows/flow-engine.ts` | 1619 | 1500+ | Flow definitions for coupons, products, Xray panel, payment gateway, broadcast, support replies, wallet adjustments, free accounts; rendering and state transitions. | Domain-specific validators and persistence are embedded in generic flow engine. | `flows/core.ts`, `flows/admin-product.flows.ts`, `flows/coupon.flows.ts`, `flows/payment-gateway.flows.ts`, `flows/support.flows.ts`, `flows/free-account.flows.ts`. | High |
| `src/bot/handlers/admin/panel.ts` | 839 | 500+ | Legacy admin command/callback UI, product/account/deposit/support actions, pagination, monitoring. | Appears partly superseded by modern views/handlers but still exported through aliases. | Decide legacy vs modern. If kept: split into `admin-product.legacy.ts`, `admin-deposit.legacy.ts`, `admin-support.legacy.ts`. | Medium |
| `prisma/schema.prisma` | 836 | 500+ | Full data model: users, products, accounts, orders, invoices, coupons, deposits, Xray, notifications, support, settings. | Schema size is normal for app, but indexes and nullable uniqueness need careful review. | No split possible; add comments/sections and migration notes. | Medium |
| `src/modules/admin/admin.service.ts` | 706 | 500+ | Dashboard, product/category/account CRUD, coupons, forced join, Xray refresh/admin operations. | Admin service mixes reporting, mutations, inventory, Xray, coupons, settings. | `admin/dashboard.service.ts`, `admin/inventory.service.ts`, `admin/catalog-admin.service.ts`, `admin/xray-admin.service.ts`, `admin/coupon-admin.service.ts`. | Medium |

## 3. Mixed-responsibility files

### `src/modules/payment/payment.service.ts`
- Mixed responsibilities: gateway HTTP calls (`requestGatewayInvoice`), gateway config CRUD, invoice persistence, callback parsing, callback idempotency, wallet credit/debit, product validation, inventory reservation, order/order item creation, Xray client creation/verification, Xray renewal, coupon usage confirmation, audit logging, event emission, monitoring, admin invoice stats.
- Suggested modules/services: gateway adapter, callback resolver, invoice repository, purchase orchestration, delivery pipeline, Xray delivery, coupon usage confirmer, payment admin query service.
- Should remain: a small facade coordinating payment-specific use cases, or backwards-compatible exports while internals are moved.

### `src/bot/handlers/modern.ts`
- Mixed responsibilities: Telegram routing, purchase orchestration, coupon management, admin mutations, free account claim, Xray inbound/group picker, referral, deposit callbacks, direct Prisma usage.
- Suggested targets: `bot/handlers/shop`, `bot/handlers/payment`, `bot/handlers/admin/xray`, `bot/handlers/admin/coupon`, `bot/handlers/free-account`, `bot/handlers/referral`.
- Should remain: registration composition and shared low-level callback token handling.

### `src/bot/views/modern.views.ts`
- Mixed responsibilities: rendering, service querying, message formatting, admin navigation, checkout totals, coupon validation preview, invoice admin detail, repeated keyboards.
- Suggested targets: domain view modules plus `bot/messages` and `bot/keyboards`.
- Should remain: view registry bootstrap.

### `src/bot/flows/flow-engine.ts`
- Mixed responsibilities: generic flow state, domain validation, service writes, payment gateway setup, coupon/product/free-account/support/broadcast flows.
- Suggested targets: domain flow definitions imported into a tiny engine.
- Should remain: `startFlow`, `handleActiveFlowText`, `handleActiveFlowPhoto`, registration helpers.

### `src/modules/admin/admin.service.ts`
- Mixed responsibilities: dashboard statistics, financial settings, catalog management, inventory, coupon list/detail, forced join, Xray refresh.
- Suggested targets: separate admin query/mutation services per domain.
- Should remain: a facade for admin panel if compatibility is needed.

### `src/services/payment-callback-server.ts`
- Mixed responsibilities: HTTP parsing, payment callback invocation, Telegram message formatting, inline keyboard construction, notification status marking.
- Suggested targets: `payment/callback-http.server.ts`, `bot/messages/payment-callback.messages.ts`, `bot/notifiers/payment.notifier.ts`.
- Should remain: HTTP server startup and request routing only.

## 4. Unused files and dead code candidates

Tooling status: `ts-prune` and `depcheck` were not available/installed; attempts through `npx` failed with npm registry `403 Forbidden`. Findings below are based on `rg` import checks and manual graph review.

| Candidate | Evidence | Confidence | Suggested action |
|---|---|---:|---|
| `src/bot/handlers/shop.ts` and `src/bot/handlers/buy.ts` | `registerHandlers` imports only `registerModernHandlers`; `buy.ts` only re-exports `shop.ts`. No production import of `registerShopHandlers` found. | High | Needs manual review, then delete legacy handler or wire intentionally. |
| `src/bot/handlers/admin/panel.ts` plus alias files `admin.router.ts`, `coupon.admin.ts`, `deposit.admin.ts`, `support.admin.ts` | Alias files re-export `registerAdminHandlers`; active handler index uses modern handler only. Tests may inspect old files but runtime does not register them. | Medium | Keep until confirmed no legacy entrypoint; otherwise delete aliases and panel. |
| `src/bot/handlers/deposit/create.ts`, `deposit/deposit.ts`, `deposit/receipt.ts` | Pure re-export aliases to `deposit/start.ts`; no active production import found. | High | Delete aliases after checking external imports/tests. |
| `src/bot/handlers/support/messages.ts` | Pure re-export alias to `support/start.ts`; no active production import found. | High | Delete alias after checking external imports/tests. |
| `src/bot/handlers/coupon/apply.ts` | Pure re-export alias for `handleStateText`; no active production import found. | High | Delete alias after checking external imports/tests. |
| `src/services/analytics.service.ts` | No import found from runtime modules; admin analytics view uses `AdminService.dashboard`, not this service. | High | Delete or wire into admin analytics if it has distinct metrics. |
| `src/jobs/deliveryCleanup.ts` | Exported `cleanupExpiredDeliveryReservations` but `src/app.ts` only imports `depositCleaner`, `purchaseCleaner`, `accountExpiration`. Tests read file as source but runtime does not schedule it. | High | Wire into startup or merge into `purchaseCleaner`; do not delete because function is useful. |
| `src/scripts/sync-xray-deliveries.ts` | Standalone script with `require.main`; no package script and not scheduled by app. | Medium | Keep as operator script; add package script or job if recovery is required. |
| Duplicate verification scripts: `scripts/verify-payment-flow.ts` and `src/scripts/verify-payment-flow.ts` | Same purpose in two locations; package script points to built `dist/scripts/verify-payment-flow.js`, while root script imports `../src`. | Medium | Consolidate into one maintained script and update package scripts. |
| `src/services/logger/index.ts` | Re-export of `../logger`; most imports use `src/services/logger.ts` path. | Medium | Delete if no external import path requires folder alias. |
| `couponMaxUses` local in `PaymentService.purchaseProduct` | Assigned from validation but not subsequently used in visible flow. | High | Remove in cleanup phase. |
| `PaymentInvoiceService` wrapper class methods | Thin proxy over `PaymentService` at bottom of same huge file; used widely by bot code. | Low as unused, High as smell | Keep for compatibility during refactor; move to separate facade after splitting internals. |

## 5. Code that exists but is not wired into actual bot flow

| Code | What it probably should do | Current wiring/evidence | Bug if unused | Safe wiring suggestion |
|---|---|---|---|---|
| `src/jobs/deliveryCleanup.ts` `cleanupExpiredDeliveryReservations` | Release expired reserved product/free accounts and stale reserving orders. | Not imported by `src/app.ts`; only `cleanStalePurchases` runs. | Reserved accounts/free tests can remain blocked if not covered by purchase cleaner; reserving orders can stay stuck. | Schedule every minute in `src/app.ts` or call from `cleanStalePurchases`; add monitoring/audit. |
| `src/scripts/sync-xray-deliveries.ts` | Detect/repair Xray clients missing in DB or panel. | Standalone only; no package script or scheduled job. | Panel/DB drift remains invisible; paid users may miss “my accounts” or have orphaned panel clients. | Add `npm run xray:sync` first; later schedule read-only sync and make repair manual. |
| `PaymentService.resolveExistingPurchaseIntent/cancelExistingPurchaseIntent` | Prevent duplicate purchase/invoice clicks and permit user cancel/resume. | Used by wallet and instant handlers, but direct cancellation only cancels invoices/orders; it does not release a specific non-expired reservation, only expired reservations. | Cancel may leave a non-expired reserved account until TTL. | Add targeted release for order/account tied to canceled intent. |
| `PaymentService.releaseExpiredReservations` | Release old product reservations. | Called by purchase cleaner and intent resolution; separate delivery cleanup also exists. | Split cleanup behavior may become unsynchronized. | One cleanup service should own all reservation release paths. |
| `PaymentService.confirmCouponUsage` | Count coupon use only after successful order. | Called for manual delivery after account sale and Xray after panel verification. Good concept, but per-user count is rechecked at confirmation time. | If user creates many invoices before paying, validation passes but later callback may fail after payment due per-user/global limit race. | Keep confirmation-on-success, but reserve coupon intent or communicate that paid callback can fail and refund/manual review is needed. |
| `PaymentService.productNotificationPayload` | Build callback result for HTTP server to notify Telegram user. | Used in callback flow. | If account has placeholder `XRAY_LIVE_LINKS`, callback server must fetch subscription URL or user gets placeholder. It currently attempts subscription URL only for xray client. | Move to notifier service and normalize delivered config/link in one place. |
| `NotificationService` admin/user utilities | Central Telegram notification abstraction. | Support and account expiration use it; payment callback server sends directly through bot. | Payment notifications bypass shared retry/audit behavior. | Route payment success/failure notifications through `notificationService`. |
| `src/modules/free-account/free-account.service.ts` reservation logic | Claim free/test Xray/manual account. | `modern.ts` calls `claimXray`; cleanup for free reservations is in unwired `deliveryCleanup.ts`. | Free accounts reserved during failed claims may stick. | Wire `deliveryCleanup` or add free-account cleanup to existing account job. |

## 6. Duplicate logic

| Area | Files | Duplicated behavior | Shared service/helper | Risk |
|---|---|---|---|---|
| Wallet vs instant product purchase | `PaymentService.purchaseProduct`, `finalizePaidProductPurchase`, `fulfillPaidInvoice`, `provisionXrayClient`, `PurchaseService.buyProduct`, `modern.ts` wallet/instant callbacks | Product validation, coupon recheck, order creation, Xray provisioning, order item creation, success notifications are spread across wallet and gateway paths. | `PurchaseOrchestrator.checkoutAndDeliver({source})` plus `DeliveryPipeline`. | High |
| Coupon checkout preview vs invoice quote vs purchase confirmation | `modern.views.ts`, `CouponService.validateForCheckout`, `PaymentService.quoteProductInvoice`, `PaymentService.purchaseProduct`, `confirmCouponUsage` | Coupon validation/calculation happens in view, invoice creation, and purchase. | `CheckoutQuoteService` returning canonical quote and selected coupon state. | Medium |
| Persian messages and checkout error keyboards | `modern.ts`, `modern.views.ts`, `payment-callback-server.ts`, `utils/messages.ts`, keyboard files | Repeated text for discount expired, insufficient wallet, invoice ready, payment success/failure. | `bot/messages` and `bot/keyboards`. | Medium |
| Admin coupon list/detail formatting | `modern.views.ts`, `AdminService`, `CouponService` | Status/expiry/usage formatting duplicated around views/services. | `coupon.presenter.ts`. | Low |
| Xray delivery state transitions | `PaymentService.provisionXrayClient`, free-account service, sync script, account expiration job | Create/verify/update/delete/orphan transitions repeated or adjacent. | `XrayDeliveryService` and `XrayLifecycleService`. | High |
| Reservation cleanup | `PaymentService.releaseExpiredReservations`, `jobs/purchaseCleaner.ts`, `jobs/deliveryCleanup.ts` | Similar stale order/reserved account cleanup exists in multiple places, with one path unwired. | `ReservationCleanupService`. | Medium |
| Admin income/statistics | `AdminService.dashboard`, `PaymentInvoiceService.stats`, invoice views | Multiple stats sources may use different amount definitions. | `RevenueStatsService` using `finalPaidAmount`/invoice `amount`. | Medium |

## 7. Payment and purchase flow audit

Checklist status:

- Product selection: handled by shop views and callbacks in `modern.views.ts` / `modern.ts`; active path is modern only.
- Coupon validation: preview in view, quote in invoice creation, recheck in purchase, confirmation after delivery. This is safer than one-time validation but can fail after payment if limits are exhausted between invoice creation and callback.
- Final amount calculation: `quoteProductInvoice` stores `originalAmount`, `discountAmount`, and final `amount`; wallet purchase calculates again in `purchaseProduct`.
- Wallet balance check: wallet path checks balance before reservation/Xray order creation in `purchaseProduct`.
- Instant invoice creation: `createProductInvoice` quotes then creates gateway invoice.
- Pending invoice resume/cancel: `resolveExistingPurchaseIntent` and `cancelExistingPurchaseIntent` exist and are called before wallet/instant actions. Cancel does not clearly release a specific current reservation immediately.
- Product account reservation: manual accounts are reserved before order creation, sold after order item creation.
- Xray client creation: Xray order/client DB row is created first, then `provisionXrayClient` calls panel and verifies.
- Xray verification: `verifyPanelClient` is called after create; failures attempt panel cleanup.
- Order completion: manual account completes inside purchase transaction; Xray completes after panel verification.
- Order item creation: manual account creates item before marking sold; Xray creates item after panel verification.
- User notification: wallet path sends from handler; instant path returns callback result to HTTP server which sends Telegram message.
- Admin income update: dashboard cache invalidation exists after callback completion; exact stats source must consistently use final paid amount.
- Discount usage confirmation: done only after manual sale or Xray verification; good, but paid invoice may fail fulfillment if coupon is exhausted by then.
- “My accounts” display: order items are the source; if Xray callback gets stuck before item creation, paid user will not see account.

Gaps and hidden bugs:

1. `npm run build` currently fails on `src/modules/payment/payment.service.ts` around possibly undefined `delivered.order/product/account`, proving type safety is already degraded in payment fulfillment.
2. `PaymentService.purchaseProduct` contains an Xray duplicate branch returning a partial object (`reused`, IDs, message) that does not match normal delivery result. Handlers/services expecting `result.product.mode` or delivery fields can crash or skip notification for duplicate wallet clicks.
3. Xray delivery does external panel work outside the DB transaction, then updates DB. This is necessary, but the failure/orphan path is complex and needs idempotent recovery tests.
4. Instant payment and wallet purchase converge partially in `purchaseProduct`/`provisionXrayClient`, but callback-specific status transitions and wallet handler-specific notifications remain separate.
5. Existing intent cancellation updates invoice/order status but does not obviously release non-expired inventory reservations tied to that canceled order.

## 8. Instant payment callback audit

- Callback URL includes internal invoice id: yes. `invoiceCallbackUrl` sets `invoice_id` and `token` query parameters.
- Callback can find user/order/product: invoice lookup supports callback token, invoice id, legacy token/id, and pay id. Product purchase requires `productId` on invoice.
- Idempotency: callback flow marks `PENDING` to `PAID` then locks fulfillment by `deliveryStatus=PROCESSING`; duplicate callbacks return existing completed result.
- Duplicate callback double delivery: intended to be prevented with invoice status/delivery status lock and order/item checks. Needs tests around stale `PROCESSING` retry.
- Successful callback triggers same delivery pipeline as wallet purchase: partially. It uses `finalizePaidProductPurchase`/`purchaseProduct` and Xray provisioning, but callback has invoice status state machine and notification path that wallet path lacks.
- User receives config: callback server sends Telegram messages for wallet/product/Xray renewal. Xray account payload may include `XRAY_LIVE_LINKS` placeholder plus subscription URL.
- Order item appears in “my accounts”: yes only after order item exists; callback failure before `provisionXrayClient` completion leaves no visible item.
- Income uses final paid amount: invoice stores `amount`; order stores `finalPaidAmount`. Audit all admin stats before trusting.
- Discount usage counted once: `confirmCouponUsage` checks existing order usage and unique schema has `couponId,userId,usageSlot`. Race safety depends on per-user count/slot under Mongo transaction.

Issues:

1. TypeScript diagnostics in callback product fulfillment indicate possibly undefined delivery fields in `payment.service.ts`; fix before refactor.
2. Paid invoice can remain `PAID` with `FAILED_DELIVERY` when fulfillment fails. This is intentional for manual repair but admin UI must surface it clearly and user notification should be consistent.
3. Coupon confirmation can fail after successful payment if usage limits change between invoice creation and callback; this blocks delivery after money is captured.
4. The callback server owns Telegram formatting directly rather than shared message/notifier modules.

## 9. Wallet purchase audit

- Wallet balance checked before Xray client creation/manual reservation: yes, inside transaction before reservation/order creation.
- Wallet decremented only after delivery verification: manual account path debits after sold update; Xray path debits after panel create+verify inside final DB transaction. Good intent.
- Discount final amount used: wallet path recalculates coupon and uses `totalAmount` for order and debit.
- Duplicate clicks: existing intent check in handler helps; service also has Xray duplicate check. Manual account duplicate protection is mostly by inventory reservation/status, not user/product idempotency.
- Failed delivery does not charge wallet: Xray debit happens after verification; manual debit happens after sold update/order item. If debit fails after marking account sold within same transaction, transaction rolls back. Good.
- Product reservation released on failure: transaction rollback releases failed manual reservation; canceled/stale non-expired reservations are less clear.

Issues:

1. Service-level duplicate Xray branch returns partial object not compatible with handler expectations.
2. Wallet handler still owns delivery message sending; instant callback owns separate notification path.
3. Coupon revalidation immediately before wallet purchase is good, but preview amount can differ from final if coupon changes.
4. No clear idempotency key for manual wallet purchase duplicate clicks beyond handler-level existing intent and inventory status.

## 10. Discount system audit

- Validation: `CouponService.validateForCheckout` checks active/deleted/expiry/usedCount/maxUses/minimum/type/value/per-user count.
- Calculation: fixed amount caps at original amount; percentage floors percentage; final amount cannot go below zero.
- Usage limit: `confirmCouponUsage` increments `usedCount` with `usedCount < maxUses`.
- Per-user usage: checkout count and confirmation count both enforce `perUserLimit`.
- Usage count display: admin coupon views display `usedCount/maxUses`.
- Usage count confirmed only after successful paid order: yes for manual sale and Xray panel verification.
- Admin income uses actual paid amount: orders store original/discount/final; invoice stores original/discount/amount. Stats should use final fields; verify all dashboard queries during implementation.

Bugs/inconsistencies:

1. Coupon usage is not reserved at invoice creation. A user can receive an invoice amount with discount, pay later, then fulfillment can fail because the coupon limit was consumed by someone else.
2. `couponMaxUses` local variable in `purchaseProduct` is unused.
3. `CouponService.validateForCheckout` returns a specific “already used” message even for per-user limit >1.
4. Hard deleting coupons deletes usage history and nulls order coupon; this may damage historical audit/reporting.

## 11. Admin income/statistics audit

Known amount fields:

- `Order.originalAmount`, `Order.discountAmount`, `Order.finalPaidAmount`, `Order.totalAmount`.
- `PaymentInvoice.originalAmount`, `discountAmount`, `amount`, `gatewayAmount`.

Findings:

- Purchase paths set `Order.finalPaidAmount` to the discounted `totalAmount`.
- Payment invoices set `amount` to final payable amount and preserve original/discount.
- Admin invoice views display final invoice `amount`.
- Risk remains in dashboard/statistics queries in `AdminService.dashboard` and `PaymentInvoiceService.stats`; during refactor, every revenue aggregation should be reviewed to use `finalPaidAmount` or invoice `amount`, never product `price`/original amount unless explicitly labelled gross.

Suggested audit query targets:

- `src/modules/admin/admin.service.ts` dashboard and income calculations.
- `src/modules/payment/payment.service.ts` invoice stats/list/detail.
- `src/bot/views/modern.views.ts` admin analytics/invoice dashboard views.

## 12. Telegram UI/message audit

Repeated/misplaced UI found in:

- `src/bot/handlers/modern.ts`: repeated discount failure keyboard, previous invoice resume/cancel text, purchase failure keyboard, instant invoice text, admin action replies.
- `src/bot/views/modern.views.ts`: checkout summary, admin coupon/invoice/product/free-account/support views, repeated admin navigation rows.
- `src/services/payment-callback-server.ts`: callback success/failure Telegram messages and keyboards.
- `src/utils/messages.ts`: already centralizes some messages (`purchaseSuccessMessage`, wallet summary, error/success/screen message), but not consistently used.
- `src/bot/keyboards/design-system.ts`, `main.keyboard.ts`, `admin.keyboard.ts`: partial centralization exists.

Suggested centralization:

- `src/bot/messages/checkout.messages.ts`
- `src/bot/messages/payment.messages.ts`
- `src/bot/messages/admin.messages.ts`
- `src/bot/keyboards/checkout.keyboard.ts`
- `src/bot/keyboards/payment.keyboard.ts`
- `src/bot/callbacks.ts` or expand `navigation/panel-ui.ts` for action constants.

## 13. Jobs/background tasks audit

| Job/task | Current status | Entry point | Schedule/startup wiring | Missing parts |
|---|---|---|---|---|
| Expired deposits cleanup | Exists | `src/jobs/depositCleaner.ts` | Initial run and every 60s in `src/app.ts` | Consider separate interval from purchase/account jobs to isolate failures. |
| Stale purchase/invoice cleanup | Exists | `src/jobs/purchaseCleaner.ts` | Initial run and every 60s in `src/app.ts` | Merge/coordinate with delivery cleanup; targeted cancel release. |
| Reserved account cleanup | Partly exists | `PaymentService.releaseExpiredReservations`; `src/jobs/deliveryCleanup.ts` | Purchase cleaner calls payment release; `deliveryCleanup.ts` not wired | Wire delivery cleanup or consolidate. |
| Xray sync/recovery | Exists as script | `src/scripts/sync-xray-deliveries.ts` | Not scheduled; no package script | Add operator script first; later scheduled read-only drift detector. |
| Expired account marking | Exists | `src/jobs/accountExpiration.ts` | Initial run and every 60s in `src/app.ts` | Ensure free/test Xray expiration is included or separate. |
| Free account expiration | Partly in free-account model/service and delivery cleanup | `src/modules/free-account/free-account.service.ts`, `src/jobs/deliveryCleanup.ts` | Not clearly scheduled except account expiration may cover assigned order items only | Add explicit free account expiration/cleanup schedule. |
| Stale invoice cleanup | Exists for product purchase pending invoices | `src/jobs/purchaseCleaner.ts` | Every 60s | Wallet top-up pending invoice expiry policy should be confirmed. |

## 14. Prisma/Mongo schema audit

Positive findings:

- `ProductAccount` and `FreeAccount` have `@@index([status, reservationExpiresAt])`, useful for cleanup.
- `CouponUsage` has `@@unique([couponId, userId, usageSlot])` and indexes on coupon/user.
- `PaymentInvoice` includes indexes for user/status/type/product/coupon/payId/callbackToken in visible schema area.

Risks to review carefully:

1. Nullable unique fields in Mongo/Prisma can be dangerous. The project already has a repair script for `PaymentInvoice.payId` blank/null legacy values, implying prior index issues. Do not add unique constraints on nullable fields without sparse/partial-index strategy.
2. Do not reintroduce `@@unique([productAccountId])` if `productAccountId` can be null. Multiple Xray order items may have null productAccountId.
3. Confirm `PaymentInvoice.callbackToken` uniqueness and `payId` uniqueness behavior with Mongo null/missing values. Existing code uses `OR: [{ payId: null }, { payId: { isSet: false } }]`, so null/missing semantics matter.
4. Consider stronger indexes for callback/idempotency: `PaymentInvoice.status`, `deliveryStatus`, `lastCallbackAt`, `payId`, `callbackToken`, and `orderId` query patterns.
5. Order cleanup queries use `status` and `createdAt`; verify compound indexes support stale purchase cleanup.
6. Xray delivery sync queries use `XrayClient.status`, `clientEmail`, `orderId`; verify indexes exist.
7. Coupon hard delete removes usage history; schema supports historical usage but service discards it on hard delete.

## 15. Dependency audit

`package.json` dependencies:

- Runtime: `@prisma/client`, `dotenv`, `prisma`, `telegraf`.
- Dev: `@types/node`, `nodemon`, `ts-node`, `typescript`, `vitest`.

Findings:

1. `prisma` is in runtime dependencies. Usually `prisma` CLI can be devDependency, but deployment scripts call `prisma generate`; keep until deployment model is clarified.
2. `npm run build` runs `prebuild` -> `prisma generate` -> `tsc`; it currently fails on TypeScript diagnostics in payment service.
3. `npx prisma validate` failed because `DATABASE_URL` is not set; this is an environment limitation, not schema proof.
4. `npx ts-prune` and `npx depcheck` failed due npm registry `403 Forbidden`; no unused dependency automation result is available.
5. Package script `payment:verify-flow` runs `node dist/scripts/verify-payment-flow.js`; if build fails, this cannot run.
6. There are root `scripts/*` and `src/scripts/*` duplicates; package scripts should consistently target one location.
7. No lint script exists. Consider adding ESLint later, but not during this audit-only step.

## 16. Suggested phased refactor plan

### Phase 1: zero-risk cleanup

- Files: alias-only re-export files (`src/bot/handlers/buy.ts`, `deposit/create.ts`, `deposit/deposit.ts`, `deposit/receipt.ts`, `support/messages.ts`, `coupon/apply.ts`, admin alias files) after confirming no external imports; `src/services/analytics.service.ts` if truly unused; unused locals in `payment.service.ts`.
- Risk: Low to Medium depending on external imports.
- Benefit: less noise in import graph and fewer legacy paths.
- Validation: `rg` imports for each deletion candidate, `npm run build`, relevant tests (`npm test` if build passes).

### Phase 2: low-risk modularization

- Files: `src/bot/views/modern.views.ts`, `src/bot/handlers/modern.ts`, `src/bot/flows/flow-engine.ts`, `src/modules/admin/admin.service.ts`.
- Actions: split by domain without changing behavior; centralize messages/keyboards first; keep existing public function names.
- Risk: Medium.
- Benefit: easier review and lower blast radius for purchase fixes.
- Validation: source-inspection tests, callback-data-length tests, manual QA `/start`, shop, admin navigation.

### Phase 3: purchase/payment stabilization

- Files: `src/modules/payment/payment.service.ts`, `src/modules/product/purchase.service.ts`, `src/services/payment-callback-server.ts`, `src/modules/coupon/coupon.service.ts`, schema indexes if needed.
- Actions: create unified delivery pipeline for wallet and gateway; fix TS errors; remove partial duplicate-return shape; make coupon paid-callback behavior explicit; improve pending invoice cancel/resume; ensure income uses final paid amount.
- Risk: High.
- Benefit: prevents double delivery/charge, paid-but-not-delivered states, discount/accounting inconsistencies.
- Validation: `npm run build`, payment callback tests, wallet atomicity tests, delivery atomicity tests, manual gateway callback with duplicate callback.

### Phase 4: jobs and sync

- Files: `src/app.ts`, `src/jobs/purchaseCleaner.ts`, `src/jobs/deliveryCleanup.ts`, `src/scripts/sync-xray-deliveries.ts`, `package.json` scripts.
- Actions: consolidate reservation cleanup; wire free/product reserved cleanup; add operator script for Xray sync; add read-only drift reporting; verify account/free expiration.
- Risk: Medium.
- Benefit: fewer stuck reservations and orphaned panel clients.
- Validation: unit/source tests for cleanup, dry-run sync, manual stale reservation fixtures.

### Phase 5: final validation

- Files: all changed modules.
- Actions: run build, Prisma validate/generate with `DATABASE_URL`, tests, manual QA checklist.
- Risk: Low once earlier phases complete.
- Benefit: confidence before deployment.
- Validation steps:
  - `npm run build`
  - `npx prisma validate`
  - `npx prisma generate`
  - `npm test`
  - Manual QA checklist in `docs/code-audit-qa-checklist.md`

## 17. Recommended next prompt/action

Recommended next prompt: “Start Phase 3 stabilization by fixing the existing TypeScript errors in `src/modules/payment/payment.service.ts` and making Xray duplicate wallet purchase return a normal delivery/idempotency result without changing UI text.”

This is recommended because payment service already fails build and is the highest-risk runtime area.
