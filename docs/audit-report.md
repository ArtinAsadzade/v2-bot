# Bot Audit and Stabilization Report

## Scope

Audited the Node.js, TypeScript, Telegraf, Prisma, MongoDB Telegram bot source tree and fixed the disconnected handlers, invalid Prisma model usages, broken state flows, and race-prone wallet/product operations discovered during compilation and code review.

## Findings fixed

- Broken imports and generated TypeScript errors caused by wrong relative paths, the removed `SessionFlavor` import, stale Prisma model names (`transaction`, `productItem`, `discount`, `configLink`), and missing `senderRole` values.
- Duplicate and conflicting Telegram listeners caused by side-effect handler imports and multiple global `bot.on("text")` / `bot.on("photo")` handlers.
- `/admin`, `/reply`, and `/addcoupon` command UX that bypassed the requested inline-button-only Telegram interface.
- Deposit flow state leakage caused by module-level maps and global listeners; replaced with per-user Telegraf session state.
- Support ticket message leakage risk caused by implicitly routing every text message to any open ticket; replaced with explicit ticket session state.
- Wallet operations that credited/debited without ledger rows or conditional balance checks.
- Purchase flow that referenced non-existent Prisma models and could oversell inventory; replaced with transaction-scoped reservation, conditional account status updates, atomic balance decrement, order creation, and delivery.
- Coupon validation that incremented usage before purchase and did not prevent duplicate user usage in the actual order flow.
- Prisma schema relation/index gaps around product order items and account reservation lookups.
- Runtime lifecycle gaps: handlers are now registered once at bootstrap, expired deposits are cleaned, global bot errors are logged, and Prisma disconnects on shutdown.

## Validation results

- `npx prisma generate` passed.
- `npx tsc --noEmit` passed.
- `npm run build` passed and regenerated tracked `dist/` output.
- `DATABASE_URL='mongodb://127.0.0.1:27017/v2bot' npx prisma validate` passed.
- `timeout 10s env DATABASE_URL='mongodb://127.0.0.1:27017/v2bot' npx prisma db push` could not complete because there is no reachable MongoDB service in this environment.
- Static duplicate/stale-handler scan passed: no `bot.command`, `bot.once`, stale `pendingDeposits`, `productItem`, `tx.transaction`, `configLink`, or `.discount` references remain in `src` or `prisma`.
