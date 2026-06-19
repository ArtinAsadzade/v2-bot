# Refactor Phase 2 Handlers Report

## Scope

Phase 2 started the low/medium-risk modularization of the oversized Telegram modern handler entry point. This pass intentionally prioritized a compatibility-preserving move over behavioral rewrites.

## Line counts

- Old `src/bot/handlers/modern.ts`: 1,635 lines.
- New `src/bot/handlers/modern.ts`: 6 lines.
- Compatibility registrar `src/bot/handlers/modern/register-modern-handlers.ts`: 1,635 lines.

## New handler modules

Created the Phase 2 handler module layout under `src/bot/handlers/modern/`:

- `register-modern-handlers.ts`
- `home.handlers.ts`
- `product.handlers.ts`
- `purchase.handlers.ts`
- `wallet.handlers.ts`
- `account.handlers.ts`
- `coupon.handlers.ts`
- `support.handlers.ts`
- `admin.handlers.ts`
- `free-account.handlers.ts`
- `xray.handlers.ts`
- `navigation.handlers.ts`
- `shared/context.ts`
- `shared/guards.ts`
- `shared/telegram-utils.ts`
- `shared/error-boundary.ts`

## What moved where

- `src/bot/handlers/modern.ts` is now a thin compatibility entry point that preserves the public `registerModernHandlers(bot)` API.
- The previous full registration implementation was moved unchanged into `src/bot/handlers/modern/register-modern-handlers.ts` with import paths updated for the new nested location.
- Domain boundary files were added for home, product, purchase, wallet, account, coupon, support, admin, free-account, xray, and navigation handlers. The next incremental pass can move one domain at a time into these files without changing the app entry point again.
- Shared low-risk helper modules were introduced for admin guard, Telegram callback/user/chat helpers, and a lightweight modern-handler error boundary.

## Intentionally untouched risky sections

The following sections remain in `register-modern-handlers.ts` for this first Phase 2 step because they are tightly coupled to session state, callback token formats, payment/delivery calls, admin permissions, or Xray picker state:

- Purchase and payment UI actions.
- Xray renewal, subscription, config, group, and inbound picker actions.
- Admin product/category/account/wallet/coupon/deposit/ticket actions.
- Free/test-account provisioning and admin management actions.
- Support live-ticket text routing.
- Flow engine photo/text handoff.

No payment service extraction or deep payment refactor was performed.

## Behavior preservation notes

- Callback formats were not changed.
- Persian UI text and button meanings were not changed.
- Database semantics were not changed.
- Payment/delivery service calls were not changed.
- Admin permission checks were preserved in-place.
- `dist/**` was not edited intentionally.

## Validation results

- `npm run build`: passed.
- `npx tsc --noEmit`: passed.
- `npx prisma generate`: passed.
- `npx prisma validate`: skipped because `DATABASE_URL` was not set in the current environment.
- `git diff --check`: passed.

## Manual QA checklist

- Start `/start` and confirm the home panel renders.
- Use `/menu`, `/shop`, `/wallet`, `/accounts`, `/support`, `/referral`, `/help` and confirm the same panels render.
- Open shop categories, product detail, checkout, coupon apply/remove, wallet purchase, and instant invoice buttons.
- Verify Xray subscription, QR, configs, and renewal buttons for an owned Xray account.
- Verify free/test account claim and admin free-account settings.
- Verify support chat start, reopen, close, and admin reply flows.
- Verify admin dashboard/menu, store status, product/category/account/wallet/coupon/deposit/ticket actions.
- Verify forced-join verify callbacks.

## Next recommended phase

Move one domain at a time from `register-modern-handlers.ts` into the prepared domain modules, starting with the lowest-risk groups:

1. `navigation.handlers.ts` for legacy views, `cancel`, `nav:*`, and forced-join verify callbacks.
2. `product.handlers.ts` for category/product/favorite navigation actions.
3. `coupon.handlers.ts` for coupon apply/change/remove UI actions.
4. `wallet.handlers.ts` for deposit wallet UI actions.
5. `support.handlers.ts` for ticket callback and live-ticket text routing.

Keep purchase/payment and Xray/admin picker flows for later because they contain higher coupling and should be moved only with focused callback regression testing.
