# UX Restructure Report

## Old vs new structure

Old user home mixed purchase, wallet, coupons, services, referrals, and account identity at one level. New home is limited to purchase, account, support, guide, and admin access when applicable.

## Moved buttons

- کیف پول, شارژ کیف پول, تراکنش‌ها, اطلاعات کاربری, دعوت دوستان, and سرویس‌های من are under حساب من.
- کد تخفیف is removed from top-level and appears in product/checkout context; the separate info screen only explains usage.
- Admin coupons, payment gateway, deposits, wallets, invoices, and transactions are under مالی.
- Admin inventory is grouped with محصولات/store operations.

## Renamed buttons

- اکانت‌های من → top-level حساب من; service list inside account is سرویس‌های من.
- وارد کردن کد تخفیف → applies only during product/checkout flow.
- پرداخت با کیف پول / پرداخت آنی appear only in checkout.

## Backward compatibility aliases

Existing callbacks such as `account.details`, `wallet`, `deposit`, `wallet.history`, `referral`, `coupon:remove:*`, `coupon:change:*`, `buy:confirm:*`, and `buy:instant:*` are retained. Old Telegram messages continue to navigate because callback formats were not changed.

## Telegram button findings

See `docs/telegram-button-capabilities.md`. The implementation does not fake colored buttons. URL buttons remain for real external links; unsupported copy_text is not used with the current Telegraf version.

## Manual QA checklist

- /start shows simplified home.
- Buy service opens categories/products.
- Product detail shows coupon entry and purchase.
- Checkout shows apply/remove coupon plus wallet/instant payment.
- Account menu shows services, wallet, top-up, transactions, coupon info, user info, referral.
- Wallet top-up works from account menu.
- My services opens existing service list.
- Support opens support flow.
- Admin dashboard uses grouped menu.
- Admin financial menu contains gateway, deposits, wallets, coupons, invoices, transactions.
- Admin Xray Center remains accessible.
- Old callback messages still work.
