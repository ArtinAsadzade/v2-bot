# Refactor Phase 1b Report

## Scope

Second low-risk Phase 1 cleanup pass focused on shrinking Telegram UI/view files and moving repeated Telegram UI construction into shared pure builders. Payment/delivery business logic, database behavior, callback formats, and Persian text meaning were intentionally preserved.

## Files changed

- `src/bot/views/modern.views.ts`
- `src/bot/views/home.views.ts`
- `src/bot/views/product.views.ts`
- `src/bot/views/purchase.views.ts`
- `src/bot/views/account.views.ts`
- `src/bot/views/wallet.views.ts`
- `src/bot/views/support.views.ts`
- `src/bot/views/free-account.views.ts`
- `src/bot/views/admin.views.ts`
- `src/bot/handlers/modern.ts`
- `src/bot/keyboards/account.keyboard.ts`
- `src/bot/keyboards/purchase.keyboard.ts`
- `src/bot/messages/account.messages.ts`
- `src/bot/messages/common.messages.ts`
- `src/bot/messages/coupon.messages.ts`

## Line count tracking

| File | Before | After | Notes |
| --- | ---: | ---: | --- |
| `src/bot/views/modern.views.ts` | 2,095 | 28 | Converted to compatibility barrel/registration coordinator. |
| `src/bot/handlers/modern.ts` | 1,687 | 1,635 | Replaced selected repeated inline keyboard/message construction with shared builders. |
| `src/bot/flows/flow-engine.ts` | 1,619 | 1,619 | Not touched; safe cleanup opportunities were less clear than the view split. |

## Modules created

### View modules

- `home.views.ts` for home, guide, and referral-facing views.
- `product.views.ts` for shop category/product/search UI views.
- `purchase.views.ts` for checkout UI view.
- `account.views.ts` for user account and renewal UI views.
- `wallet.views.ts` for wallet/deposit UI views.
- `support.views.ts` for support UI view.
- `free-account.views.ts` for free account UI view.
- `admin.views.ts` for admin panel UI views.

`modern.views.ts` remains as a backward-compatible registration file and re-export barrel so existing imports can continue using the original module path.

### Keyboard modules

- `account.keyboard.ts` centralizes selected Xray account inline keyboards.
- `purchase.keyboard.ts` centralizes selected purchase-delivery and purchase-recovery inline keyboards.

### Message modules

- `account.messages.ts` centralizes selected repeated account/Xray messages.
- `common.messages.ts` centralizes selected common command messages.
- `coupon.messages.ts` centralizes selected coupon helper messages.

## Behavior preserved

- `dist/**` was not touched.
- Callback data strings and callback matching were preserved.
- Persian message/button meaning was preserved; moved text was kept equivalent and only obvious dynamic values were parameterized.
- Database behavior was not changed.
- Payment and delivery business logic was not refactored.
- Admin permission flow was not changed.
- View registration order remains equivalent through `registerModernViews()`.

## Risky blocks intentionally left untouched

- Payment and delivery internals in purchase confirmation handlers were left in place except for surrounding UI builders.
- Admin Xray/free-test picker handlers were left largely untouched because they mix UI with live panel state and callback-token state.
- `flow-engine.ts` was not changed in this pass to avoid accidental state machine behavior changes.
- Large admin views were moved as a domain module but not deeply refactored because many of them are coupled to admin service reads and callback-token generation.

## Validation results

- `npm run build`: passed.
- `npx tsc --noEmit`: passed.
- `npx prisma generate`: passed.
- `git diff --check`: passed.
- `npx prisma validate`: skipped because `DATABASE_URL` was not set in the environment.

## Manual QA checklist after deploy

- `/start` and home menu
- Product list/detail
- Wallet top-up UI
- Wallet purchase UI
- Instant payment invoice UI
- Coupon apply UI
- My accounts UI
- Support open/close
- Admin panel menus
- Free account UI

## Next recommended phase

Continue Phase 1 with one more low-risk UI pass before touching business logic:

1. Split `admin.views.ts` further into narrower admin domains (`admin-product`, `admin-finance`, `admin-support`, `admin-settings`) while keeping registration order stable.
2. Move the remaining pure inline keyboards from `modern.ts` into domain keyboard modules where callback formats are obvious.
3. Add snapshot-style tests for critical keyboard callback data before any payment/delivery refactor.
