# Test Drift Fix Report

Date: 2026-06-19

## Failing tests found

Initial `npm test` failed for two drift categories:

1. Vitest reported `No test suite found` for the legacy static tests because those files used `node:test` while the project test command runs `vitest run`.
2. Static-path assertions still read pre-refactor facade files such as `src/bot/views/modern.views.ts`, `src/bot/handlers/modern.ts`, and `src/modules/payment/payment.service.ts`, so assertions failed after behavior moved into modular files.
3. `tests/payment-callback-server.test.ts` failed with a mock export error: the mocked `../src/bot/keyboards/design-system` module did not expose newly imported reply keyboard factories such as `ShopKeyboard`, `PaymentKeyboard`, and `SettingsKeyboard`.

Representative failing messages included:

- `Error: No test suite found in file ...`
- `No "ShopKeyboard" export is defined on the "../src/bot/keyboards/design-system" mock.`
- Static assertion misses such as empty source blocks for `registerView("account.renew")`, `sendPurchaseDelivery`, `verifyPanelClient`, and payment callback retry checks.

## Root cause

The recent modular refactor moved implementation details out of broad facades and into focused modules, while static tests still scanned the old files directly. Runtime public facades remained available, but source-scanning tests needed to follow the new module boundaries.

## Files changed

Test-only changes were made in `tests/**`:

- Converted static tests from `node:test` imports to Vitest `test` imports so `npm test` discovers them under the configured Vitest harness.
- Updated static source readers to include modular view files under `src/bot/views/*`.
- Updated static source readers to include modular modern handler files under `src/bot/handlers/modern/*` and `src/bot/handlers/modern/admin/*`.
- Updated static source readers to include split payment files under `src/modules/payment/*`, especially `payment.types.ts`, `payment-fulfillment.service.ts`, `payment-delivery.service.ts`, `payment-callback.service.ts`, and `wallet-payment.service.ts`.
- Updated source-scanning assertions whose protected behavior now lives behind helper functions or extracted services, without changing payment, delivery, callback format, or Persian message behavior.

No `dist/**` files were touched.

## Mocks updated

`tests/payment-callback-server.test.ts` now exports the keyboard factories required by the refactored reply-keyboard import chain from its `design-system` mock:

- `MainMenuKeyboard`
- `ShopKeyboard`
- `UserKeyboard`
- `WalletKeyboard`
- `PaymentKeyboard`
- `SupportKeyboard`
- `AdminKeyboard`
- `SettingsKeyboard`

## Compatibility tests added/updated

The existing facade and compatibility coverage was preserved and updated to the modular layout:

- Modern view registration tests still import `registerModernViews` from the `modern.views.ts` facade while scanning all modular view files for `callbackFor` targets.
- Modern handler static tests continue checking registration and purchase/renewal routes through the modular handler source set.
- Payment facade tests continue importing `PaymentService`/`PaymentInvoiceService` from `payment.service.ts` while static payment safety assertions scan the extracted payment services.
- Payment type re-export coverage remains in static payment tests by scanning `payment.service.ts` plus `payment.types.ts`.

## Payment safety tests preserved

Payment safety assertions remain meaningful and were pointed at the new implementation files:

- Wallet balance is checked before inventory reservation/order creation/panel provisioning.
- Duplicate wallet Xray purchase is guarded before provisioning or wallet debit.
- Xray provisioning verifies the panel client before wallet debit and order-item completion.
- Failed panel provisioning cleanup still asserts deletion/orphan audit behavior and no wallet debit in the failure block.
- Instant callback retry/idempotency and `FAILED_DELIVERY` handling are checked in `payment-callback.service.ts`.
- `ProductDeliveryResult` narrowing is checked through the extracted fulfillment/types modules.
- Coupon usage confirmation remains asserted after successful delivery/completion rather than unpaid invoice creation.

## Validation results

- `npm test` passed: 24 files, 120 tests.
- `npm run build` passed.
- `npx tsc --noEmit` passed.
- `npx prisma generate` passed.
- `npx prisma validate` was skipped because `DATABASE_URL` was not set in this environment.
- `git diff --check` passed.

## Remaining test risks

No remaining test failures were observed. The remaining risk is inherent to source-scanning tests: future modular moves can require updating test source-reader file lists even when runtime behavior is unchanged.
