# Dead-code cleanup report

Date: 2026-06-22

## Scope

Audited post-UI-migration UI-only modules in:

- `src/bot/ui/`
- `src/bot/keyboards/`
- `src/bot/messages/`
- `src/bot/views/`
- `src/bot/navigation/`

Reference documents reviewed:

- `docs/ui-migration-report.md`
- `docs/telegram-ui-ux-redesign.md`
- `docs/ui-ux-audit-report.md`
- `docs/code-audit-report.md`

## Unused code found

- `src/bot/keyboards/user-menu.keyboard.ts` duplicated the active `homeKeyboard`/main-menu view keyboard and was only referenced by tests.
- `src/bot/keyboards/product.keyboard.ts` duplicated product-detail and product-card builders while active product screens use `productDetailViewKeyboard` from `view-keyboards.ts`.
- `src/bot/keyboards/admin-dashboard.keyboard.ts` duplicated the active admin dashboard view keyboard and was only referenced by tests.
- `accountActionKeyboard` existed as an inline-keyboard helper but the actual `account.xray` view still carried its own action rows.
- `adminDangerConfirmKeyboard` and `adminDangerConfirmMessage` existed but dangerous admin confirmation handlers still used local inline keyboard arrays/messages.
- `errorUxMessages` existed but Xray subscription/config failure paths still emitted local one-off error strings.
- `shop.checkout` contained unused local variables and `void` keepalive statements for coupon actions/labels after the checkout keyboard was centralized.

## Code removed

- Removed `src/bot/keyboards/user-menu.keyboard.ts` because it was a duplicate home-menu builder with no production import.
- Removed `src/bot/keyboards/product.keyboard.ts` because active product screens already use `productDetailViewKeyboard`, and its legacy callbacks (`buy:wallet`, `buy:invoice`, `coupon:apply`) were not the active post-migration callbacks.
- Removed `src/bot/keyboards/admin-dashboard.keyboard.ts` because active admin dashboard rendering uses `adminDashboardViewKeyboard`.
- Removed checkout-view dead locals that existed only to satisfy old/static references; compatibility is now documented at the shared keyboard call site instead.

## Code wired into flows

- Wired the account action keyboard into the active `account.xray` view via `accountActionViewKeyboard`, preserving subscription, QR, configs, refresh, renewal, support, and home actions.
- Wired admin danger confirmation helpers into hard-delete category/product confirmation handlers and account/wallet delete confirmation handlers.
- Wired Xray error UX copy into subscription, QR, and config failure paths.
- Kept checkout/product/admin dashboard flows on the shared `view-keyboards.ts` helpers.

## Deleted keyboard replacement verification

Previous deleted keyboard files from the migration report remain covered:

- `admin-products.keyboard.ts`: product/category/admin store actions are rendered from `admin.views.ts` and modern admin handlers; no missing production import was found.
- `admin-xray.keyboard.ts`: Xray admin settings/client actions are rendered from `admin.views.ts` and modern Xray/admin handlers; no missing production import was found.
- `wallet.keyboard.ts`: wallet screens and payment callbacks use `WalletActionKeyboard`, `paymentSuccessKeyboard`, `paymentFailureKeyboard`, and wallet view rows; no missing production import was found.

Additional duplicate keyboard modules removed in this pass are replaced by:

- `user-menu.keyboard.ts` → `common.keyboard.ts` `homeKeyboard` plus `design-system.ts` reply keyboards.
- `product.keyboard.ts` → `view-keyboards.ts` `productDetailViewKeyboard` and `checkoutViewKeyboard`.
- `admin-dashboard.keyboard.ts` → `view-keyboards.ts` `adminDashboardViewKeyboard`.

## Callback compatibility validation

Validated callback compatibility in automated tests for:

- Home: `nav:home`
- Products/categories/details: `nav:shop.categories`, `nav:shop.product`, `nav:shop.checkout`
- Checkout: `buy:confirm:*`, `buy:instant:*`, `flow:cancel`, `coupon:remove:*`, `coupon:change:*`
- Wallet/deposit: `nav:wallet`, `nav:deposit`
- Account/Xray actions: `xray:sub:*`, `xray:qr:*`, `xray:configs:*`, `nav:account.xray`, `nav:account.renew`
- Support: `nav:support`
- Admin dashboard/store/finance/Xray: `nav:admin.dashboard`, `nav:admin.store`, `nav:admin.finance`, `nav:admin.xraySettings`
- Admin delete confirmations: existing `admin:*:delete:force:*` callback formats are preserved behind the shared danger keyboard.

## Tests added or updated

- Updated `tests/telegram-ui-redesign.test.ts` to assert active shared view keyboards instead of deleted duplicate keyboard modules.
- Added `tests/ui-dead-code-cleanup.test.ts` to cover exported keyboard builders, active message builders, callback compatibility, and Back/Home/Cancel presence on major keyboards.

## Remaining intentional unused exports

No confirmed dead UI/message/keyboard helper remains intentionally unused. Some exports are compatibility/public helpers used by tests and/or runtime modules:

- Design-system reply-keyboard factories are preserved because `reply.keyboard.ts`, quick replies, and payment callback delivery rely on them.
- Purchase recovery/delivery keyboards remain exported because modern purchase/coupon handlers use them directly.
- Xray account delivery keyboards remain exported because modern Xray handlers use them directly.

## Validation results

- `npm test -- --run`: passed.
- `npm run build`: passed. `dist/**` was restored afterward so the final patch does not touch build output.
- `npx tsc --noEmit`: passed.
- `npx prisma generate`: passed.
- `npx prisma validate`: skipped because `DATABASE_URL` was not set in the environment.
- `git diff --check`: passed.

## Dist policy

`dist/**` was not intentionally edited. Running `npm run build` generated local `dist` changes; these were reverted before finalizing this patch.
