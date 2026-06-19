# Refactor Phase 2b Handler Extraction Report

## Scope

Continued Phase 2 by extracting callback, command, and message handler registrations out of `src/bot/handlers/modern/register-modern-handlers.ts` and into existing domain handler modules. This pass was intentionally move-only: callback/action matchers, callback data patterns, Persian UI strings, payment behavior, delivery behavior, and service calls were preserved.

## Line-count summary

| File | Lines after extraction |
| --- | ---: |
| `src/bot/handlers/modern/register-modern-handlers.ts` | 29 |
| `src/bot/handlers/modern/navigation.handlers.ts` | 160 |
| `src/bot/handlers/modern/home.handlers.ts` | 134 |
| `src/bot/handlers/modern/product.handlers.ts` | 57 |
| `src/bot/handlers/modern/purchase.handlers.ts` | 235 |
| `src/bot/handlers/modern/wallet.handlers.ts` | 105 |
| `src/bot/handlers/modern/account.handlers.ts` | 3 |
| `src/bot/handlers/modern/coupon.handlers.ts` | 73 |
| `src/bot/handlers/modern/support.handlers.ts` | 239 |
| `src/bot/handlers/modern/admin.handlers.ts` | 774 |
| `src/bot/handlers/modern/free-account.handlers.ts` | 93 |
| `src/bot/handlers/modern/xray.handlers.ts` | 152 |

Old `register-modern-handlers.ts` line count before extraction: 1635.
New `register-modern-handlers.ts` line count after extraction: 29.

## What moved where

- `navigation.handlers.ts`
  - Legacy compatibility redirects for old inline buttons.
  - Generic cancel action.
  - Generic `nav:*` panel navigation handler.
  - Photo flow pass-through handler.
- `home.handlers.ts`
  - Public plans command handler and cooldown state.
  - User-facing commands such as menu, shop, wallet, accounts, support, guide, and referral.
  - Admin shortcut commands.
  - `/start` handler including referral payload and `start=shop` behavior.
- `product.handlers.ts`
  - Category-to-product listing callback.
  - Product detail callback.
  - Favorite toggle compatibility callback.
- `purchase.handlers.ts`
  - Purchase delivery UI helper.
  - Checkout entry callback.
  - Existing purchase cancellation/resume callback.
  - Wallet purchase confirmation callback.
  - Instant invoice creation callback.
- `coupon.handlers.ts`
  - Expired checkout recovery helper.
  - Coupon remove/change/apply-from-product callbacks.
- `wallet.handlers.ts`
  - Wallet deposit selection and crypto invoice/receipt UI path.
- `free-account.handlers.ts`
  - Legacy `free_config` redirects.
  - Free account claim flow.
- `xray.handlers.ts`
  - User-owned Xray subscription, QR, and config callbacks.
  - Xray renewal summary and wallet/instant renewal callbacks.
- `support.handlers.ts`
  - Support chat start/resume/close callbacks.
  - Admin support chat callback.
  - Text message handling for quick-reply navigation, active flows, and live ticket conversations.
- `admin.handlers.ts`
  - Admin Xray/free-test picker and settings callbacks.
  - Admin product guide, public plans, and payment gateway callbacks.
  - Admin free-account management callbacks.
  - Admin store, category, account inventory, wallet, coupon, forced-join, referral, user, product, deposit, and ticket management callbacks.
- `account.handlers.ts`
  - No separate callback registrations were safely isolated in this pass; account-facing Xray renewal callbacks moved to `xray.handlers.ts` because they directly share Xray renewal helpers.

## Risky or intentionally deferred blocks

- The admin domain remains large. It was moved into `admin.handlers.ts` as a single module to avoid introducing additional import/callback-order risk during this move-only pass. A later pass can split it into admin submodules.
- `account.handlers.ts` remains a boundary placeholder because the current extracted account-facing actions are tightly coupled to Xray renewal flows.
- Shared imports were kept broad in domain files to minimize behavioral drift during the extraction. A later cleanup can narrow imports once callback parity is verified.

## Validation results

- `npm run build`: passed.
- `npx tsc --noEmit`: passed.
- `npx prisma generate`: passed.
- `npx prisma validate`: skipped because `DATABASE_URL` was not present in the validation environment.
- `git diff --check`: passed.
- `dist/**`: not modified.

## Manual QA checklist

- Open `/start` and verify the home panel renders.
- Open `/start shop` and verify category listing renders.
- Navigate home/shop/wallet/support/account/admin panels via inline buttons and quick-reply buttons.
- Open a product, apply/remove/change coupon, and return to checkout.
- Confirm purchase with wallet using an available test product.
- Create an instant payment invoice and verify the invoice UI and recovery buttons.
- Open wallet deposit flow and select a crypto wallet.
- Claim/display a free account.
- Open Xray subscription, QR, configs, and renewal actions for an owned Xray account.
- Start, continue, close, and admin-reply to a support ticket.
- Exercise admin store/category/product/account/wallet/coupon/free-account/payment-gateway/Xray/ticket actions.

## Next recommended phase

Phase 2c should split `admin.handlers.ts` into focused admin submodules (`admin-dashboard`, `admin-products`, `admin-users`, `admin-payments`, `admin-coupons`, `admin-support`, and `admin-xray`) and introduce a small shared helper/dependency module to reduce repeated imports without changing callback behavior.
