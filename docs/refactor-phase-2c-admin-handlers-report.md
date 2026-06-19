# Refactor Phase 2c Admin Handler Extraction Report

## Scope

Continued Phase 2 cleanup by splitting `src/bot/handlers/modern/admin.handlers.ts` into focused admin domain handler modules under `src/bot/handlers/modern/admin/`.

This pass was intentionally move-only. Callback matchers, callback data/action formats, admin guard checks, session keys, Persian messages/buttons, Prisma/service calls, payment behavior, delivery behavior, and admin permissions were preserved.

## Line-count summary

Old `src/bot/handlers/modern/admin.handlers.ts` line count before extraction: 774.
New `src/bot/handlers/modern/admin.handlers.ts` line count after extraction: 6.

| File | Lines after extraction |
| --- | ---: |
| `src/bot/handlers/modern/admin.handlers.ts` | 6 |
| `src/bot/handlers/modern/admin/index.ts` | 18 |
| `src/bot/handlers/modern/admin/admin-inventory.handlers.ts` | 517 |
| `src/bot/handlers/modern/admin/admin-settings.handlers.ts` | 128 |
| `src/bot/handlers/modern/admin/admin-products.handlers.ts` | 120 |
| `src/bot/handlers/modern/admin/admin-payments.handlers.ts` | 87 |
| `src/bot/handlers/modern/admin/admin-coupons.handlers.ts` | 56 |
| `src/bot/handlers/modern/admin/admin-users.handlers.ts` | 48 |
| `src/bot/handlers/modern/admin/admin-support.handlers.ts` | 65 |

## New module structure

- `src/bot/handlers/modern/admin.handlers.ts`
  - Compatibility wrapper only.
  - Delegates registration to `registerAdminDomainHandlers(bot)`.
- `src/bot/handlers/modern/admin/index.ts`
  - Admin domain registration composer.
  - Registers extracted modules in stable grouped order.
- `src/bot/handlers/modern/admin/admin-inventory.handlers.ts`
  - Xray/free-test inbound and group picker helpers/actions.
  - Free test enabled/inbound save actions.
  - Xray client refresh action.
  - Free account view/status/delete actions.
  - Product account inventory status/move/delete actions.
- `src/bot/handlers/modern/admin/admin-settings.handlers.ts`
  - Xray panel enabled action.
  - Product guide status/delete actions.
  - Public plans enabled/disabled action.
  - Payment gateway status/test actions.
  - Store status action.
  - Forced join status/delete actions.
  - Referral tier status/delete actions.
- `src/bot/handlers/modern/admin/admin-products.handlers.ts`
  - Category status/delete/hard-delete actions.
  - Product active/duplicate/delete/hard-delete actions.
- `src/bot/handlers/modern/admin/admin-payments.handlers.ts`
  - Crypto wallet status/delete actions.
  - Deposit approve/reject actions.
- `src/bot/handlers/modern/admin/admin-coupons.handlers.ts`
  - Coupon status and soft/hard delete actions.
- `src/bot/handlers/modern/admin/admin-users.handlers.ts`
  - User ban/unban action.
- `src/bot/handlers/modern/admin/admin-support.handlers.ts`
  - Admin ticket open/close/reopen actions.

## What moved where

- Inventory/free-account/Xray picker registrations moved from the large admin handler into `admin-inventory.handlers.ts`.
- Store/system/Xray panel/payment gateway/product guide/public plans/forced-join/referral settings registrations moved into `admin-settings.handlers.ts`.
- Category and product mutation registrations moved into `admin-products.handlers.ts`.
- Wallet and deposit admin registrations moved into `admin-payments.handlers.ts`.
- Coupon mutation registrations moved into `admin-coupons.handlers.ts`.
- User block/unblock registration moved into `admin-users.handlers.ts`.
- Support ticket registrations moved into `admin-support.handlers.ts`.

## Risky blocks left untouched

- No handler blocks were left in the compatibility wrapper.
- The Xray picker/free-test/product-create helper block remains together in `admin-inventory.handlers.ts` because it shares callback-token helpers, flow state, Xray inbound/group state, and product-create completion. Splitting that block further would be riskier than the safe move-only extraction requested.
- No `admin-dashboard.handlers.ts` or `admin-broadcast.handlers.ts` file was created because this source module did not contain dashboard or broadcast registrations to move in this pass.
- Imports were intentionally kept broad in extracted files to minimize extraction risk. Narrowing unused imports can be a later style-only cleanup after behavior parity is confirmed.

## Validation results

- `npm run build`: passed.
- `npx tsc --noEmit`: passed.
- `npx prisma generate`: passed.
- `npx prisma validate`: skipped because `DATABASE_URL` was not set in the validation environment.
- `git diff --check`: passed.
- `dist/**`: untouched.

## Manual QA checklist

- [ ] Admin panel open.
- [ ] Admin dashboard stats.
- [ ] Admin product/category management.
- [ ] Admin inventory/account management.
- [ ] Admin income/payment views.
- [ ] Admin coupon management.
- [ ] Admin user block/unblock.
- [ ] Admin support tickets.
- [ ] Admin settings.
- [ ] Admin broadcast if present.

## Next recommended phase

Phase 2d should split the large extracted `admin-inventory.handlers.ts` block into smaller low-risk subdomains after manual QA confirms this pass:

1. Xray picker helpers/actions.
2. Free test/free-account inventory actions.
3. Manual product account inventory actions.

A follow-up style-only cleanup can also narrow duplicated imports across admin domain files without changing registrations.
