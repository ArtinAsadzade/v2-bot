# Refactor Phase 1 Report

## Scope
Started the Phase 1 zero/low-risk cleanup refactor. The changes only centralize pure constants, callback builders, keyboard builders, message builders, and formatting helpers. Business logic, database behavior, payment/delivery logic, and purchase flow conditions were intentionally preserved.

## Files changed
- `src/bot/callbacks/index.ts`
  - Added typed callback/action builder groups for common navigation, purchase, coupon, support, and Xray callback data.
  - Callback data remains compatible with existing `callbackFor`, `actionFor`, and legacy callback matching.
- `src/bot/messages/purchase.messages.ts`
  - Added message builders for pending invoice, stuck purchase, and unauthorized access messages.
- `src/bot/keyboards/common.keyboard.ts`
  - Added pure reusable builders for the home keyboard and support close/home inline keyboard.
  - No Prisma/database access is used in keyboard builders.
- `src/utils/money.ts`
  - Added pure toman formatting helper.
- `src/utils/dates.ts`
  - Added pure Persian date/date-time formatting helpers for future cleanup phases.
- `src/utils/formatters.ts`
  - Extracted pure display helpers previously embedded in `modern.views.ts`, including page counts, stock labels, account/payment status labels, progress bar, and short IDs.
- `src/bot/views/modern.views.ts`
  - Replaced local pure helper definitions with imports from utility modules.
  - Replaced the inline home keyboard with the centralized `homeKeyboard` builder.
- `src/bot/handlers/modern.ts`
  - Reused centralized common callback/message/keyboard builders in selected high-repeat purchase, support, navigation, and Xray response paths.

## Major file line counts
| File | Before | After |
| --- | ---: | ---: |
| `src/modules/payment/payment.service.ts` | 2609 | 2609 |
| `src/bot/views/modern.views.ts` | 2121 | 2095 |
| `src/bot/handlers/modern.ts` | 1689 | 1687 |
| `src/bot/flows/flow-engine.ts` | 1619 | 1619 |

## Behavior intentionally preserved
- `dist/**` was not touched.
- Database behavior was not changed.
- Payment, delivery, and purchase-flow conditions were not changed.
- Existing Persian button text and centralized messages were preserved as-is where extracted.
- Generated callback data continues to use the same `callbackFor`, `actionFor`, and literal callback formats, so existing regex/action matching remains compatible.

## Validation commands run
- `npx tsc --noEmit`
- `npm run build`
- `npx prisma generate`
- `git diff --check`
- `npx prisma validate` when `DATABASE_URL` is available.

## Manual QA flows after deploy
Use `docs/code-audit-qa-checklist.md` to manually verify:
- `/start`
- Product list
- Product detail
- Wallet top-up
- Wallet purchase
- Instant payment invoice
- Coupon apply
- Admin panel
- My accounts
- Support

## Next recommended phase
Continue Phase 1 by moving additional pure inline keyboards and message builders from `modern.views.ts`, `modern.ts`, and `flow-engine.ts` into focused modules. Keep service/business extraction for a later phase after callback/message/keyboard centralization is complete.
