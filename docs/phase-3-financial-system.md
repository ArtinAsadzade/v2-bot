# Phase 3 Financial System

Phase 3 introduces a fintech-grade financial core for the Persian Telegram bot. It intentionally stops before Xray provisioning and focuses on wallets, immutable ledgering, crypto deposit infrastructure, pricing, purchase preparation, and auditability.

## Wallet architecture

- Every user has one Toman wallet with `balance_toman`, `frozen_balance_toman`, lifetime deposit/spend counters, and a version column for optimistic observability.
- Wallet mutations are performed only through the ledger service.
- The service opens a database transaction and locks the wallet row with `SELECT ... FOR UPDATE` before calculating before/after balances.
- Frozen funds support purchase drafts and future withdrawals without removing money from the ledger prematurely.

## Transaction ledger system

- `wallet_transactions` is append-only by product policy. Transactions are never deleted.
- Each entry stores type, direction, status, amount, balance before, balance after, frozen before, frozen after, reference IDs, provider references, metadata, and an idempotency key.
- Idempotency keys protect retries, webhook replays, admin double-clicks, and queue redelivery.
- Pending deposit rows are created when invoices are issued; a completed credit row is created only after payment verification.

## Crypto payment infrastructure

- `PaymentProvider` defines the adapter seam for invoice creation, payment verification, webhook signature checks, and webhook parsing.
- The current deterministic TRC20 mock adapter supports local development and tests while preserving the production adapter contract.
- Invoices track provider invoice IDs, asset amount, address, confirmations, expiration, and payment transaction hashes.
- Webhooks are persisted with payload hashes and event uniqueness before processing, so replays are detectable and auditable.

## Queue jobs

BullMQ is used for:

1. payment verification retries,
2. deposit expiration,
3. reconciliation checks,
4. financial notification dispatch foundations.

All jobs are idempotent by invoice ID or event ID and use retry/backoff defaults from the shared queue factory.

## Pricing engine

- Pricing rules are stored in `pricing_rules` and selected by status, region, segment, time window, and priority.
- The default baseline is 100,000 Toman per GB.
- Coupons are modeled as a foundation with percentage and fixed discounts, redemption counters, status, and validity windows.
- All calculations use integer Toman amounts and Decimal.js helpers for deterministic basis-point math.

## Purchase preparation

Purchase drafts calculate the final price, validate wallet availability, optionally reserve funds by increasing frozen balance, and expire after 15 minutes. They do not provision Xray clients.

## Admin financial operations

Finance-capable admins (`OWNER`, `ADMIN`, `FINANCE`) can charge, deduct, refund, bonus, freeze, and unlock wallets. Every operation includes admin attribution, reason text, idempotency, and financial audit logs.

## Security and integrity decisions

- No JavaScript floating-point math is used for Toman balances.
- Wallet updates are atomic and row-locked.
- Webhook signatures use HMAC and timestamp replay windows.
- Provider payloads are never trusted directly; webhooks only enqueue verification.
- Unique provider event IDs and invoice idempotency keys prevent duplicate deposits.
- Financial audit logs are separate from the wallet ledger to support operational forensics.

## Scalability considerations

- Ledger, invoice, webhook, pricing, and audit tables have query-oriented indexes.
- Provider adapters are swappable and multi-provider-ready.
- Background queues isolate slow chain verification from API latency.
- Reconciliation jobs provide a future path for provider-vs-ledger consistency checks.
