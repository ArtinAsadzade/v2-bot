# Full System Audit & Technical Due Diligence Report

Date: 2026-06-23  
Repository: `v2-bot`  
Scope: Telegram bot, Prisma/MongoDB data model, payment gateway, wallet, Xray automation, prediction, referral, free-account, support, admin workflows, jobs, Docker/deployment, tests.

## Executive Summary

This project has clearly undergone several stabilization/refactor passes: payment code is split into callback, fulfillment, delivery, amount validation, redaction, and notification services; Xray has diagnostics and repair utilities; inventory reservation is atomic; and many regression tests exist. However, production risk remains high because several critical workflows still combine external side effects, MongoDB transactions, and Telegram callbacks without enough idempotency, schema constraints, or recovery tooling.

The highest-risk areas are:

1. **Xray delivery and renewal reliability**: remote panel calls happen outside the database transaction, but state transitions and stock increments are completed later. Failure after panel creation can create orphan panel users or paid invoices stuck as `PAID/FAILED_DELIVERY`.
2. **Payment callback trust model**: callbacks can resolve by `invoice_id`, `pay_id`, or token. The token is strong, but fallback lookup by `payId` and invoice id means security depends heavily on gateway secrecy and amount integrity rather than requiring the callback token for all modern gateway flows.
3. **Wallet/Xray renewal charge timing**: wallet renewals debit the user before the Xray panel update succeeds; if the panel update fails, the code marks renewal failure but does not refund automatically.
4. **Prediction rewards are incomplete for product prizes**: wallet prizes are credited; product rewards are only marked claimed with a comment saying existing delivery tooling can fulfill later. This is a dead-end user flow.
5. **MongoDB constraints/indexing are incomplete for production idempotency**: `payId` is indexed but not unique in the Prisma schema; order and invoice linkage is not unique; active-processing state is not modeled as a proper lock with owner/lease; many relations have no cascade policy and MongoDB cannot enforce relational integrity.
6. **Admin UX is wide but inconsistent**: many admin modules exist, but dangerous flows such as Xray cleanup/repair, deposits, broadcast, user bans, product deletion, and coupon deletion rely on button flows and audit logs rather than a consistent confirmation/safeguard pattern.
7. **Callback registration and UI imports show architectural drift**: modern handlers import broad keyboard sets repeatedly; several legacy handlers still coexist with modern handlers; many older audit documents exist, indicating repeated partial migrations.

Overall production readiness score: **5.4 / 10**. The product is viable for controlled operation with active admin supervision, but not ready for unattended high-volume production.

## Top 20 Problems

| # | Severity | Area | Finding | Impact | Fix complexity |
|---|---|---|---|---|---|
| 1 | Critical | Xray renewal | Wallet renewal debits before remote Xray update, no automatic refund on failure. | Users can lose wallet balance while renewal remains failed. | Medium |
| 2 | Critical | Payment callback | Modern callbacks can be resolved without requiring callback token when `invoice_id` or `pay_id` matches. | Callback spoofing risk if gateway references leak. | Medium |
| 3 | Critical | Xray delivery | External panel client creation occurs before final DB transaction/stock increment; cleanup is best-effort. | Orphaned panel clients or paid undelivered orders. | High |
| 4 | High | Payment fulfillment | `PAID` invoice with stale `PROCESSING` can be retried after 5 minutes without a durable fulfillment job/lease owner. | Duplicate fulfillment attempts under long Xray latency. | Medium |
| 5 | High | Database | `PaymentInvoice.payId` is only indexed, not unique in schema. | Duplicate gateway ids possible unless manual script/index exists. | Low/Medium |
| 6 | High | Prediction | Product prediction rewards are marked claimed but not delivered. | Winners get no product despite successful claim. | Medium |
| 7 | High | Xray diagnostics | `cleanupBrokenClients` marks stale inbound clients `deleted` and deactivates items without user-facing recovery. | Active paid services can disappear from user panel. | Medium |
| 8 | High | Free test | Free test stock update reads singleton inside update condition; race and disabled/missing singleton handling are fragile. | Quota may be miscounted or claim may crash. | Medium |
| 9 | High | Support | Ticket messages store raw user text; no content limits visible at service layer. | Spam, oversized records, admin overload. | Low |
| 10 | High | Broadcast | Broadcast service needs rate limiting/failure accounting review; mass sends can hit Telegram limits. | Broadcasts fail or block bot throughput. | Medium |
| 11 | Medium | Admin auth | Environment admin ids and DB roles both grant admin; no explicit superadmin separation in common `adminOnly`. | Privilege boundaries are blurry. | Medium |
| 12 | Medium | Payment UX | Pending purchase resolver blocks new purchase while stale states require support/retry paths. | Users get stuck after failed callback/delivery. | Medium |
| 13 | Medium | DB integrity | MongoDB relations are modeled but no cascades/foreign-key enforcement. | Orphan invoices/orders/coupon usages after deletes. | High |
| 14 | Medium | Performance | Xray sync verifies every client with multiple network calls concurrently. | Panel/API overload on large user base. | Medium |
| 15 | Medium | Startup | All jobs run immediately during bootstrap before bot launch. | Slow or failed startup under DB/API slowness. | Low/Medium |
| 16 | Medium | UI consistency | Many handlers import the same large keyboard set, evidence of mixed old/new UI composition. | Inconsistent navigation and dead buttons. | Medium |
| 17 | Medium | Environment/deploy | Docker compose exposes port 3000 for callback server; no healthcheck. | Hard to detect broken callback service. | Low |
| 18 | Medium | Logging/security | Xray token masking exists, but gateway config API keys are stored plaintext in DB. | Secret exposure on DB dump. | Medium |
| 19 | Medium | Coupon | Coupon use confirmation depends on later delivery; failures can leave coupon not consumed or consumed inconsistently. | Revenue and user fairness issues. | Medium |
| 20 | Low | Code quality | Many old reports and legacy handlers remain alongside modern handlers. | Onboarding complexity and regression risk. | Low/Medium |

## Critical Bugs

### CB-01 — Wallet Xray renewal can debit without successful renewal

- **Severity**: Critical
- **Affected area**: Wallet, Xray renewal, user account lifecycle
- **Root cause**: `renewXrayWithWallet` creates a renewal and debits the wallet inside a transaction, then calls `applyXrayRenewal` outside that transaction. If `XrayClientService.updateClient` fails, `applyXrayRenewal` marks `XrayRenewal` and `XrayClient` as `renewal_failed` but does not refund the wallet debit.
- **Reproduction**:
  1. Create active Xray client and product renewal plan.
  2. Give user enough balance.
  3. Make Xray panel unavailable or return an update error.
  4. Trigger wallet renewal.
  5. Observe wallet transaction debit exists while renewal/client is `renewal_failed`.
- **Fix complexity**: Medium. Add saga semantics: debit into escrow, apply remote update, commit debit only after verify; or auto-credit compensating transaction on failure with idempotency reference.

### CB-02 — Payment callback should require callback token for modern invoices

- **Severity**: Critical
- **Affected area**: Direct payments, wallet top-up, Xray renewal, gateway callbacks
- **Root cause**: Callback resolution first accepts token, but also accepts invoice id, legacy token, and `payId`. The generated callback URL includes token, so the safer production posture is to require token for gateway callbacks after migration.
- **Reproduction**:
  1. Create pending invoice with known `payId` or invoice id.
  2. Call callback endpoint with matching `pay_id` or `invoice_id`, without token.
  3. If amount integrity passes and invoice is pending, the system proceeds to mark paid and fulfill.
- **Fix complexity**: Medium. Introduce gateway version flag and reject tokenless callbacks for all invoices with `callbackToken` populated, while retaining a controlled legacy migration path.

### CB-03 — Xray purchase can create panel client before DB finalization

- **Severity**: Critical
- **Affected area**: Xray delivery, payment fulfillment, stock, order state
- **Root cause**: `provisionXrayClient` calls the remote panel `createClient` and verifies the client before the transaction that increments `soldCount`, creates `OrderItem`, marks invoice complete, and marks order completed. If the later DB transaction fails, the remote client already exists and cleanup is best effort.
- **Reproduction**:
  1. Create Xray product with stock limit one less than concurrent demand.
  2. Process two paid purchases concurrently.
  3. Both may create remote panel clients before one loses the stock update race.
  4. The loser attempts cleanup; cleanup failure leaves `orphaned_panel_client`.
- **Fix complexity**: High. Reserve Xray capacity before panel create; use fulfillment jobs with durable leases; write outbox record; make cleanup retryable.

### CB-04 — Prediction product rewards do not deliver product

- **Severity**: High
- **Affected area**: Prediction, rewards, product delivery
- **Root cause**: `claimReward` credits wallet rewards, but product rewards are only marked claimed/rewarded with a comment that delivery can happen from audit trail. No actual product reservation/delivery happens.
- **Reproduction**:
  1. Create prediction contest with `rewardType=product`.
  2. Select winners.
  3. Winner claims reward.
  4. Winner status becomes claimed, but no order/order item/product account is delivered.
- **Fix complexity**: Medium. Integrate product prize with `PaymentDeliveryService` in a zero-price/reward mode and add inventory safeguards.

### CB-05 — Xray diagnostic cleanup can deactivate paid services too aggressively

- **Severity**: High
- **Affected area**: Xray center, account panel, support load
- **Root cause**: `cleanupBrokenClients` verifies active/provisioning/failed clients and, on stale inbound ids, sets client status to `deleted` and deactivates all order items. It does not create a user-facing recovery ticket, replacement flow, or staged quarantine.
- **Reproduction**:
  1. Change panel inbound ids after products were sold.
  2. Run Xray cleanup.
  3. Clients with old inbound ids are marked deleted and order items inactive.
- **Fix complexity**: Medium. Quarantine first, notify admins/users, offer repair/rebind/reprovision before hiding active service.

### CB-06 — `payId` uniqueness is not guaranteed by Prisma schema

- **Severity**: High
- **Affected area**: Payments, callback idempotency
- **Root cause**: Schema has `@@index([payId])`, not a unique sparse index. Code attempts duplicate detection and has a script named `fix-payment-invoice-pay-id-index.ts`, but the schema does not encode the invariant.
- **Reproduction**:
  1. Use two invoice records with same non-null `payId` if DB lacks manual unique index.
  2. Callback lookup by `payId` uses `findFirst`, so the wrong invoice may be selected.
- **Fix complexity**: Low/Medium. Add documented MongoDB unique sparse index migration and assert it during startup/health checks.

## Security Findings

### Critical

1. **Tokenless callback fallback**: Callback URLs include a generated token, but resolution still accepts invoice id and pay id. Require token for all non-legacy invoices.
2. **Plaintext operational secrets in database**: `PaymentGatewayConfig.apiKey` and `XrayPanelConfig.apiToken` are plain fields. Masking exists for logs, but DB compromise exposes gateway and panel credentials.

### High

1. **Admin privilege boundaries are broad**: `adminOnly` grants access to env ids and DB `admin`/`superadmin` roles. Superadmin-only flows should use a separate guard consistently.
2. **Callback endpoint exposed on public port without source validation**: Docker exposes port 3000. The app validates invoice details but does not validate gateway source IP/signature.
3. **Dangerous Xray cleanup/repair actions need stronger safeguards**: Cleanup can deactivate accounts and mark clients deleted.
4. **Raw support and admin flow inputs need size/range limits at service boundaries**: Telegram limits message size, but service methods should enforce limits independent of UI.

### Medium

1. **Referral codes are deterministic from Telegram id**. This is acceptable for marketing but should not be treated as secret.
2. **Audit metadata can contain large JSON strings**. Add size caps and structured redaction for all security-sensitive actions.
3. **No healthcheck or readiness gate around callback server**. Operational security suffers because downtime may go unnoticed.

### Low

1. **Token masking only covers Bearer tokens in Xray errors**. Extend redaction to URLs, API keys, and gateway response bodies.

## Xray Findings

- **Panel config selection is ambiguous**: `getEnabledConfig` picks the most recently updated enabled config. Products have `xrayPanelConfigId`, but client creation uses global enabled config and does not pass the product-specific panel. This can provision clients on the wrong panel when multiple configs exist.
- **Inbound snapshot exists but is not authoritative in delivery**: Products store `inboundIds` and `inboundSnapshot`; delivery checks only current `inboundIds` length and later diagnostics check live inbounds. A product can be sold with stale inbound ids until verification fails.
- **Traffic conversion risk**: `createClient` and `updateClient` send `totalGB: Number(input.trafficBytes)`. If the panel expects gigabytes rather than bytes, quotas will be wrong. If the API expects bytes despite the name, rename adapter fields internally to avoid future mistakes.
- **Subscription availability is treated as delivery blocker**: Verification requires subscription URL to be reachable. A transient subscription endpoint failure causes paid delivery failure even if client creation succeeded.
- **Cleanup is destructive**: Stale inbound cleanup sets DB status to `deleted` and disables order items. Prefer `needs_repair`/`quarantined` state.
- **No panel-client orphan discovery**: `syncReport` hardcodes `orphanPanelClients: 0`. It does not list panel clients and compare against DB.
- **Renewal does not verify after update**: `applyXrayRenewal` calls `updateClient` and updates DB; it does not call diagnostics verification or subscription check after renewal.
- **Multi-panel product field is underused**: `Product.xrayPanelConfigId` and `XrayClient.panelConfigId` exist, but creation does not populate/use the panel id.

## Payment Findings

- **Positive design**: Payment flow has amount integrity checks, callback token generation, callback count, audit logs, gateway response redaction, duplicate gateway id detection, and idempotent manual inventory delivery.
- **Callback authorization remains too permissive**: Accepting `pay_id` or invoice id without token should be a legacy-only mode.
- **Fulfillment locking is weak**: `deliveryStatus=PROCESSING` is a status flag, not a job lease with owner, attempt, deadline, and idempotency key.
- **Invoice lifecycle lacks a terminal refund state for paid delivery failures**: Existing statuses include `PAID`, `COMPLETED`, `FAILED`, `EXPIRED`, etc., while order has `refund_required/refunded`. Payment invoice does not clearly model `REFUND_REQUIRED`.
- **Wallet payment and direct payment share delivery logic, but Xray side effects differ**: Wallet Xray purchase debits after panel verification; wallet Xray renewal debits before panel update.
- **Pending invoice cleanup can expire invoices while gateway may still callback**: Stale invoice handling should support late success callbacks with explicit reconciliation instead of a blanket non-payable response.
- **Notification failure does not alter fulfillment**: This is good for delivery integrity, but there should be retry queue for Telegram notifications.

## Database Findings

- **MongoDB relation integrity is application-only**: Prisma relations do not enforce cascades in MongoDB. Delete/update flows must manually protect or detach `Order`, `OrderItem`, `CouponUsage`, `PaymentInvoice`, `XrayClient`, and `XrayRenewal`.
- **Missing unique invariant for gateway `payId`**: Must be unique sparse/partial in MongoDB.
- **Order-to-invoice and renewal-to-invoice cardinality is unclear**: `PaymentInvoice.orderId` is not unique and `XrayRenewal.invoiceId` is indexed but not unique.
- **Product title duplicate is enforced in service logic only**: No DB uniqueness for `(categoryId,title,mode,deletedAt=null)`. Race can create duplicates.
- **Category name uniqueness conflicts with soft delete**: `Category.name @unique` prevents recreating a deleted category with the same name.
- **Coupon code uniqueness conflicts with soft delete**: `Coupon.code @unique` prevents recreating deleted coupon code unless intentional.
- **Counter fields need reconciliation jobs**: `Product.soldCount`, `Coupon.usedCount`, `FreeTestConfig.usedCount`, and `DailyStats` can drift from source records.
- **BigInt fields require careful JSON handling**: Xray traffic bytes are `BigInt`; logs/responses must avoid raw `JSON.stringify` on BigInt.

## UX Findings

- **User purchase recovery is support-heavy**: Pending-purchase resolver can display processing/stale/failed states, but many routes still direct users to support instead of self-service retry/cancel/refund.
- **Xray service labels hide actual links**: Several delivery payloads return `XRAY_LIVE_LINKS` placeholders; the user notification later fetches links. If notification fails, account details must be the reliable source.
- **Mixed Persian/English technical statuses**: Internal statuses like `FAILED_DELIVERY`, `PROCESSING`, `XRAY_LIVE_LINKS`, and Persian UI strings are mixed in flows and messages.
- **Admin-facing diagnostics use technical wording**: Xray statuses such as `orphaned_panel_client`, `stale_inbounds`, and `missing_sub_id` need action-oriented Persian labels.
- **Dead-end product reward claim**: Prediction winners can claim a product reward without receiving a product or clear next step.
- **Free test flow likely confusing on quota failures**: If stock or panel create fails, user gets a generic retry/support message while internal quota may not be consumed.

## UI Consistency Report

- **Keyboard architecture is split** among `bot/keyboards`, `bot/ui`, `bot/navigation`, and modern handlers. There is a design system, callback token utilities, panel UI, and many domain-specific keyboard files.
- **Repeated broad imports** of purchase keyboards across unrelated modern handlers indicate low cohesion and high risk of unused/dead buttons.
- **Callback naming is partially structured** (`nav:*`, `admin:xray:*`, domain callback patterns) but not centralized enough to guarantee route coverage.
- **Navigation expectations**: Every critical screen should have Back, Home, Support, and context-aware Retry/Cancel where applicable. Xray repair/diagnostic and payment failure screens need stronger recovery actions.
- **Visual hierarchy**: Admin panels risk “button warehouse” layouts because management areas contain create/edit/delete/sync/repair/report actions in Telegram inline keyboards. Split primary action, secondary actions, and danger zone.

## Admin Findings

- **Products/categories/inventory**: Service-level protections exist for soft delete and duplicate checks, but multi-step admin creation/edit flows need stronger validation summaries before commit.
- **Coupons**: Soft delete is present, but unique code means deleted codes cannot be reused. Admin UI should communicate this.
- **Wallets/deposits**: Deposit approval uses transaction/updateMany idempotency. Add two-person review or confirmation for large deposits.
- **Users**: Ban/unban must display consequences: support access, active services, wallet balance, pending invoices.
- **Support**: Needs inbox triage, SLA labels, and spam controls.
- **Prediction**: Creation flow exists, but result setting, winner selection, and reward claiming are separate and product prizes are not fulfilled.
- **Xray center**: Strong diagnostics foundation, but cleanup and repair are too dangerous without dry-run and confirmations.
- **Broadcasts**: Needs dry-run count, rate-limit estimate, pause/resume, failure export, and audience filters.

## Technical Debt Findings

- **Legacy + modern handler coexistence**: Files under `bot/handlers` and `bot/handlers/modern` both exist, increasing routing ambiguity.
- **Service boundaries are better in payment than elsewhere**: Payment has dedicated service slices; prediction/referral/free-test are comparatively monolithic.
- **State machines are implicit strings**: Payment delivery statuses, Xray statuses, and order statuses are scattered. Introduce explicit transition functions.
- **External side effects need outbox/saga pattern**: Xray, Telegram notification, gateway callbacks, and broadcasts should use durable jobs.
- **Audit logs are untyped**: Many actions use arbitrary strings and JSON metadata. Add typed audit event schema.
- **Old docs indicate migration drift**: Numerous prior audit/refactor reports exist. Consolidate into an architecture decision record and delete outdated plans.

## Dead Code / Dead Feature Findings

- **Product prediction reward delivery is effectively dead/incomplete**.
- **`syncReport` reports `orphanPanelClients: 0` without implementation**, so the feature appears present but incomplete.
- **`Product.xrayPanelConfigId` and `XrayClient.panelConfigId` appear underused**, suggesting incomplete multi-panel support.
- **Legacy handlers (`buy.ts`, `shop.ts`, `wallet.ts`, etc.) coexist with modern handler modules**, requiring route reachability tests.
- **Historical docs under `docs/` include many superseded audit/refactor reports**, which can confuse maintainers unless archived.

## Performance Findings

- **Startup runs many jobs before bot launch**: Crypto refresh, deposit cleanup, purchase cleanup, account expiration, prediction close, and delivery cleanup run during bootstrap. Slow DB/API work delays bot availability.
- **One-minute global interval runs multiple jobs together**: Deposit, purchase, expiration, prediction, and delivery cleanup all run every minute. Under load, job duration can overlap operational workload.
- **Xray sync is network-heavy**: `syncReport` verifies every client, and each verification lists inbounds and gets client details; this is O(N) network calls plus repeated inbound calls.
- **Broadcast risk**: Telegram send loops must respect flood limits and should not share the main bot event loop without queueing.
- **Admin dashboard cache invalidation is event-driven but should have metrics**: Dashboard cache correctness depends on invalidation calls.

## Missing Tests / Coverage Gaps

Existing tests cover many key flows: payment callback server, instant callback, wallet atomicity, delivery atomicity, Xray repeat purchase idempotency, Xray product sync, prediction feature/create flow, coupon system, callback data length, UI audits, and admin UX.

Missing or weak coverage:

1. Wallet Xray renewal failure refunds/compensation.
2. Tokenless callback rejection for modern invoices.
3. Duplicate `payId` DB invariant test against a real MongoDB index.
4. Multi-panel Xray provisioning uses product panel config.
5. Product prediction reward actual delivery.
6. Xray cleanup dry-run vs destructive apply.
7. Late gateway callback after invoice expiration/cancellation.
8. Telegram notification retry after successful fulfillment.
9. Broadcast rate limit and partial failure recovery.
10. Admin dangerous-action confirmation tests.
11. Category/coupon soft-delete recreation behavior.
12. Migration/reconciliation tests for soldCount/usedCount drift.

## Architecture Findings

The codebase is a Telegram-first modular monolith with Prisma/MongoDB persistence. The domain modules are recognizably separated (`payment`, `product`, `xray`, `wallet`, `referral`, `prediction`, `support`, `admin`), while bot handlers and keyboards still show transitional architecture.

Recommended architectural target:

- Keep Telegram handlers thin: parse callback/input, call application service, render view.
- Add durable workflow layer for payment fulfillment, Xray provisioning/renewal, broadcasts, and notifications.
- Add typed state machines for order/payment/Xray transitions.
- Add outbox table/collection for external side effects.
- Add reconciliation jobs that compare invoices/orders/accounts/panel clients.
- Consolidate UI navigation and callback registry.

## Recommended Refactor Phases

### Phase 0 — Production guardrails (P0)

- Require callback token for modern invoices.
- Add/verify unique sparse index for `PaymentInvoice.payId`.
- Add Xray wallet-renewal compensation/refund.
- Disable destructive Xray cleanup or convert to dry-run by default.
- Add healthcheck endpoint and deployment readiness docs.

### Phase 1 — Payment/Xray saga hardening (P1)

- Introduce fulfillment job collection with lease owner, attempt count, next retry, terminal states.
- Move Xray create/update/delete into durable saga steps.
- Add outbox notifications for Telegram messages.
- Add late-callback reconciliation flow.

### Phase 2 — Database integrity and reconciliation (P1)

- Add startup checks for indexes.
- Add reconciliation scripts for `soldCount`, coupon usage, free-test usage, orphaned invoices/orders.
- Define soft-delete uniqueness policy.

### Phase 3 — Admin UX and safety (P2)

- Standardize dangerous-action confirmations.
- Add dry-run reports for broadcast/Xray cleanup/deletions.
- Add admin dashboards for payment failures, Xray failures, pending deposits, and stale orders.

### Phase 4 — User UX repair (P3)

- Add self-service retry/cancel/refund status screens.
- Fix product reward claiming/delivery.
- Normalize Persian terminology and navigation.

### Phase 5 — Code quality consolidation (P4)

- Remove unreachable legacy handlers after callback route coverage proves unused.
- Centralize keyboard/callback registry.
- Convert implicit status strings to typed transition helpers.
- Consolidate old docs into ADRs/current runbooks.

## Production Readiness Scorecard

| Category | Score | Rationale |
|---|---:|---|
| Reliability | 5/10 | Payment has idempotency attempts, but Xray external side effects and fulfillment retries are fragile. |
| Maintainability | 6/10 | Modules are recognizable; legacy/modern split and broad imports increase cognitive load. |
| Security | 5/10 | Strong callback token exists but is not mandatory; secrets are plaintext; admin boundaries need tightening. |
| Scalability | 5/10 | Polling/jobs and Xray sync are acceptable at small scale but not high volume. |
| UX | 5/10 | Persian UI exists, but stale/payment/Xray failure flows are support-heavy. |
| Admin Experience | 5/10 | Many admin functions exist; safeguards and consistency are incomplete. |
| User Experience | 5/10 | Core purchase can work, but recovery, product rewards, and technical states are weak. |
| Code Quality | 6/10 | Payment refactor is good; other modules need state-machine and workflow boundaries. |
| Test Coverage | 6/10 | Good regression suite for known issues; missing failure, security, and saga tests. |

## Risk Assessment

- **Immediate P0 risk**: Paid users can be left with failed Xray delivery/renewal and manual support burden. Callback spoofing risk exists if identifiers leak and token is not required.
- **Operational P1 risk**: Admins must manually reconcile stuck invoices, orphaned Xray panel clients, failed notifications, and stale processing states.
- **Product P2 risk**: Prediction product rewards and Xray cleanup can create user-visible trust issues.
- **Technical P3 risk**: Continued changes across legacy/modern handlers and scattered UI systems will increase regression probability.

## Remediation Priority Matrix

| Priority | Work item | Effort | Risk | Impact |
|---|---|---:|---:|---:|
| P0 | Require callback token for modern invoices | 1-2 days | Medium | Very high |
| P0 | Add wallet renewal refund/escrow | 2-4 days | Medium | Very high |
| P0 | Verify unique payId sparse index | 0.5-1 day | Low | High |
| P0 | Disable/dry-run destructive Xray cleanup | 0.5 day | Low | High |
| P1 | Durable fulfillment job/lease system | 1-2 weeks | High | Very high |
| P1 | Xray saga/outbox with retryable cleanup | 1-2 weeks | High | Very high |
| P1 | Reconciliation scripts and dashboards | 1 week | Medium | High |
| P2 | Admin dangerous action confirmations | 3-5 days | Low | Medium |
| P2 | Broadcast dry run/rate-limited queue | 3-5 days | Medium | Medium |
| P3 | Product prediction reward delivery | 3-5 days | Medium | Medium |
| P3 | User recovery screens | 1 week | Medium | High |
| P4 | Legacy handler cleanup and callback registry | 1-2 weeks | Medium | Medium |
