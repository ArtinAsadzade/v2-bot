# Phase 2 — Information Architecture & Navigation Refactor Report

## 1. Product Map

### User Side
- **Buy**: shop, categories, recommendations, products, product detail, checkout, coupons, catalog search.
- **My Services**: active services, expired services, renewals, subscription links, QR/config details, service history.
- **Wallet**: balance, top-up, deposit, transactions, invoices.
- **Rewards**: referral program, referral rewards, predictions, free test accounts.
- **Support**: tickets, new ticket, connection/payment support paths, contact, guides, product guide.
- **Profile**: profile and account-level information.

### Admin Side
- **Commerce**: products, categories, inventory/accounts, coupons, payments, wallets, invoices, deposits, orders, transactions.
- **Customer**: users, user blocks, tickets, referrals, predictions, analytics.
- **Xray**: center, panels, panel detail, sync, sync preview, settings, clients, client detail, free accounts.
- **Marketing**: broadcasts/notifications, announcements/content, product guides, campaign/reward surfaces.
- **System**: dashboard, bot settings, store settings, forced join, monitoring/log-style operations.

## 2. Navigation Graph

The canonical graph is defined in `src/bot/navigation/information-architecture.ts` as `NAVIGATION_GRAPH`.

Key entry routes:
- `home → shop/services/wallet/referral/support/account`
- `admin.dashboard → admin.store/admin.usersSupport/admin.xrayCenter/admin.content/admin.botSettings`

Primary workflow routes:
- Buy: `home → shop → shop.categories/search → shop.products → shop.product → shop.checkout`
- Renew: `home → services → services.active → account.xray → services.renew`
- Recharge: `home → wallet → wallet.topup → deposit`
- Xray admin: `admin.dashboard → admin.xrayCenter → admin.xrayClients → admin.xrayClient`
- Broadcast: `admin.dashboard → admin.content → admin.notifications`

## 3. User Module Architecture

User navigation now follows user goals instead of database objects:
1. **Buy** — purchase discovery and checkout.
2. **My Services** — existing service management and renewal.
3. **Wallet** — balance and recharge workflows.
4. **Rewards** — referral, prediction, and gift/free-test rewards.
5. **Support** — tickets, help, announcements/guides.
6. **Profile** — account identity and history surfaces.

## 4. Admin Module Architecture

Admin navigation now follows operating domains:
1. **Commerce** — catalog, stock, payments, wallets, coupons.
2. **Customer** — users, support, referrals, predictions.
3. **Xray** — panels, clients, sync, diagnostics.
4. **Marketing** — broadcasts, announcements, campaigns, rewards/guides.
5. **System** — settings, forced join, monitoring, maintenance.

## 5. Click Depth Report

Common workflows are documented in `CLICK_DEPTH_REPORT` and kept within the 1–3 click target:
- Buy service: 3 clicks to checkout.
- Renew service: 3 clicks to renewal.
- Recharge wallet: 2 clicks to top-up.
- Create product: 2 clicks to creation flow from admin dashboard.
- Create prediction: 1 click to prediction domain.
- View Xray client: 3 clicks to client detail.
- Send broadcast: 2 clicks to notifications/broadcasts.

## 6. Architecture Violations Fixed

- Consolidated duplicate shop/category/product entry logic under **Buy**.
- Consolidated account/service/renewal paths under **My Services**.
- Moved referral + prediction + free test mental model into **Rewards**.
- Separated admin operational tools into Commerce, Customer, Xray, Marketing, and System domains.
- Added explicit IA metadata to prevent hidden/unowned screens.

## 7. Screens Reorganized Count

`NAVIGATION_AUDIT.screensReorganizedCount` currently tracks all mapped screens across user and admin IA modules.

## 8. Navigation Improvements Count

`NAVIGATION_AUDIT.navigationImprovementsCount` tracks canonical graph edges and direct workflow improvements.

## 9. Remaining Risks

- Some legacy callback aliases still point to old concepts for compatibility; they should remain until analytics show safe removal.
- Some list screens have search metadata before all specialized search flows are equally rich; future phases should standardize user/user-ticket/Xray-client search UX.
- Telegram callback payload limits require continued regression testing when new deep links or query params are added.
