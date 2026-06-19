# Manual QA Checklist for v2-bot

Use this checklist after refactor/fix phases. Record Telegram user IDs, product IDs, invoice IDs, order IDs, and timestamps for every run.

## General access

- [ ] `/start` for a new user creates/loads user and shows the main panel.
- [ ] `/start` for an existing user preserves wallet balance, referrals, and session behavior.
- [ ] Forced join: user not in required channels sees join prompt and cannot access shop actions.
- [ ] Forced join: after joining, user can continue to shop.
- [ ] Store disabled: non-admin user sees disabled-store message and cannot purchase.
- [ ] Blocked user: blocked user sees blocked message and cannot proceed.
- [ ] Admin user can still access admin panel when normal store is disabled.

## Shop and product list

- [ ] Product categories load.
- [ ] Product list shows only active/not-deleted/in-stock products.
- [ ] Product detail shows price, duration, inventory/stock, and purchase buttons.
- [ ] Out-of-stock product cannot be purchased.
- [ ] Xray-auto product with incomplete config cannot be purchased.

## Wallet top-up

- [ ] Manual crypto wallet top-up flow shows currencies/wallets.
- [ ] Deposit amount validation rejects invalid/too-small amounts.
- [ ] Deposit receipt/photo submission creates pending deposit.
- [ ] Admin approval credits wallet exactly once.
- [ ] Admin rejection does not credit wallet.
- [ ] Payment gateway wallet top-up invoice creates payment link.
- [ ] Successful wallet top-up callback credits wallet exactly once.
- [ ] Duplicate wallet top-up callback does not double-credit.

## Wallet purchase

- [ ] User with insufficient balance receives wallet-shortage path before delivery starts.
- [ ] User with sufficient balance can buy a manual inventory product.
- [ ] Wallet is debited only after manual account is sold/order item exists.
- [ ] User receives manual account config.
- [ ] Manual account appears in “my accounts”.
- [ ] Wallet purchase of Xray product creates panel client, verifies it, debits wallet, creates order item, and sends config/subscription.
- [ ] Duplicate wallet purchase click does not double charge or create duplicate panel clients.
- [ ] Simulated Xray panel failure does not debit wallet and marks delivery for admin review.
- [ ] Product reservation is released/rolled back after failed wallet purchase.

## Instant payment invoice

- [ ] Instant payment creates invoice with `invoice_id` callback URL and token.
- [ ] Pending invoice resume shows previous payment link.
- [ ] Pending invoice cancel prevents old invoice from completing purchase.
- [ ] Expired invoice cannot be reused.
- [ ] New invoice after cancel/expiry uses current price/coupon state.

## Instant payment callback

- [ ] Callback by `invoice_id` finds invoice.
- [ ] Callback by gateway `pay_id` finds invoice if applicable.
- [ ] Invalid callback reference returns safe failure and creates audit/monitoring event.
- [ ] Successful product callback marks invoice `PAID` then `COMPLETED` after delivery.
- [ ] Duplicate successful callback returns already-processed response and does not double deliver.
- [ ] User receives config after product callback.
- [ ] Product appears in “my accounts” after callback.
- [ ] Failed delivery after paid callback leaves invoice visible for admin repair and user receives clear failure/support message.

## Coupon/discount

- [ ] Valid percentage coupon applies in checkout preview.
- [ ] Valid fixed coupon applies and does not reduce below zero.
- [ ] Expired/inactive/deleted coupon is rejected.
- [ ] Minimum purchase amount is enforced.
- [ ] Per-user usage limit is enforced.
- [ ] Global usage limit is enforced.
- [ ] Coupon usage count increments only after successful paid order delivery.
- [ ] Failed/canceled invoice does not increment usage count.
- [ ] Admin coupon list shows accurate `usedCount/maxUses`.
- [ ] Admin income/statistics use final paid amount after discount, not original product price.

## Admin income today/statistics

- [ ] Today income includes wallet purchases completed today.
- [ ] Today income includes successful instant product payments completed today.
- [ ] Today income excludes pending/canceled/failed invoices.
- [ ] Discounted order contributes final paid amount only.
- [ ] Wallet top-ups are not counted as product sales income unless explicitly intended.
- [ ] Admin invoice detail shows original, discount, final, gateway amount, callback count, delivery status.

## Free/test account claim

- [ ] Free/test settings can be enabled/disabled by admin.
- [ ] Eligible user can claim exactly once according to policy.
- [ ] Manual free account claim reserves/assigns one account.
- [ ] Xray free account claim creates and verifies panel client.
- [ ] Claim failure releases reservation or marks it for cleanup.
- [ ] Free/test account expiration is reflected in user account list.

## My accounts

- [ ] Manual purchased accounts show username/password/config/link and expiry.
- [ ] Xray accounts show subscription link/config and expiry.
- [ ] Expired accounts are marked inactive/expired.
- [ ] Renew buttons appear only for eligible Xray accounts/products.
- [ ] Renew with wallet updates traffic/expiry and wallet balance.
- [ ] Renew with instant payment updates traffic/expiry after callback.

## Admin products and inventory

- [ ] Admin can create/edit category.
- [ ] Admin can create/edit manual product.
- [ ] Admin can add/edit/delete manual inventory account.
- [ ] Admin can create/edit Xray-auto product with inbound/group settings.
- [ ] Product validation rejects invalid price/duration/stock/traffic.
- [ ] Inventory status transitions available -> reserved -> sold are visible.
- [ ] Reserved stale accounts are cleaned after TTL.

## Support ticket

- [ ] User can create support ticket/message.
- [ ] Admin sees ticket and can reply.
- [ ] User receives admin reply.
- [ ] Ticket close/reopen status behaves correctly.
- [ ] Support notifications do not break if Telegram send fails.

## Xray delivery and sync

- [ ] Xray panel connection test succeeds with valid config.
- [ ] Xray panel connection test fails safely with invalid config.
- [ ] Xray delivery creates client in expected inbound/group.
- [ ] Verification detects missing panel client and blocks completion.
- [ ] Orphaned panel client cleanup is attempted on failure after create.
- [ ] Xray sync dry-run detects DB clients missing in panel.
- [ ] Xray sync repair mode only changes intended records.

## Stale pending cleanup

- [ ] Stale product purchase invoice becomes expired after TTL.
- [ ] Stale order in reserving/pending becomes canceled or failed_delivery according to panel work.
- [ ] Reserved manual product account is released after TTL.
- [ ] Reserved free account is released after TTL.
- [ ] Stale processing payment callback can be retried without duplicate delivery.
- [ ] Cleanup job emits audit/monitoring logs for non-zero cleanup.
