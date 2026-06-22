# Telegram UI Migration Report

## Migrated screens

- `home.views.ts`: home dashboard now uses shared `card`, `section`, `joinSections`, labels, icons, and the shared home keyboard.
- `product.views.ts`: category, product list, search, and product detail screens use layout helpers, labels, icons, section titles, and the shared product detail view keyboard. Product detail now shows a card layout with pricing, discount guidance, and final price sections.
- `purchase.views.ts`: checkout summary uses shared cards/sections for base price, discount, final amount, and wallet status, plus a shared checkout keyboard with back/home/cancel coverage.
- `wallet.views.ts`: wallet summary, transaction history, and deposit screens use shared layout helpers, section titles, labels, and icons.
- `account.views.ts`: profile and My Accounts screens use shared layout helpers. My Accounts now renders each account as a card with status, expiry, traffic, and renewal guidance, plus shared account-list actions.
- `support.views.ts`: support landing screen uses shared card and section helpers with shared labels/icons.
- `admin.views.ts`: admin dashboard uses KPI cards, grouped action sections, warning sections, shared labels/icons, and a shared admin dashboard keyboard.
- `free-account.views.ts`: free account eligibility screen uses shared card/section layout, labels, icons, and section titles.

## Deleted dead UI code

- Removed `src/bot/keyboards/wallet.keyboard.ts` because its exported builder was not imported or used.
- Removed `src/bot/keyboards/admin-xray.keyboard.ts` because its exported builder was not imported or used.
- Removed `src/bot/keyboards/admin-products.keyboard.ts` because its exported builder was not imported or used.

## Remaining screens

- No remaining major user-facing or admin-facing panel views are intentionally left on the old layout path.
- Some legacy non-panel handler replies still exist outside the audited view files and can be modernized in a later cleanup pass if required.
