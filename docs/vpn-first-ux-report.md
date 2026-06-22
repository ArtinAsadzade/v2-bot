# VPN-first UX correction report

## Old menu before redesign

The older bot navigation emphasized direct service actions: buy service, receive a free test, view purchased accounts/services, wallet, support, referral, and admin panel for admins. This model was closer to user intent for a VPN/Xray business because free trials and service management were visible immediately.

## Current regressed menu

The recent redesign reduced the home menu to a generic dashboard shape:

- 📦 خرید سرویس / 👤 حساب من
- 🆘 پشتیبانی / 📘 راهنما
- admin dashboard for admins

This caused regressions:

- 🎁 دریافت تست رایگان was no longer visible on the home screen.
- 🧩 سرویس‌های من was effectively moved behind account/profile navigation.
- ♻️ تمدید سرویس was not a direct home action.
- 👤 حساب من became too prominent for a service-first product.
- The home text used a generic welcome paragraph and consumed mobile screen space.
- Coupon navigation risked being perceived as a top-level destination rather than a checkout/account utility.

## New VPN-first menu

The corrected home menu is:

Row 1:
- 📦 خرید سرویس
- 🎁 دریافت تست رایگان

Row 2:
- 🧩 سرویس‌های من
- ♻️ تمدید سرویس

Row 3:
- 👤 حساب من
- 💳 کیف پول

Row 4:
- 🆘 پشتیبانی
- 📢 اطلاعیه‌ها

Row 5:
- 📘 راهنما

Admins also see:

- 🛠 پنل مدیریت

## Why each button exists

- 📦 خرید سرویس: primary revenue action and the fastest route to plan selection.
- 🎁 دریافت تست رایگان: primary conversion action for new users; keeps existing eligibility checks in the free-test flow.
- 🧩 سرویس‌های من: high-frequency returning-user action for viewing active VPN/Xray services, configs, subscription links, and status.
- ♻️ تمدید سرویس: high-frequency lifecycle action; opens a renewable-service picker and then the existing renewal flow.
- 👤 حساب من: retained for account summary, wallet status, transactions, coupon entry, and user profile information without dominating the home screen.
- 💳 کیف پول: still top-level because balance and top-up are directly tied to purchases.
- 🆘 پشتیبانی: essential for service issues, delivery questions, and payment problems.
- 📢 اطلاعیه‌ها: reserved for broadcast/news style navigation while preserving an existing safe destination.
- 📘 راهنما: product and usage education for setup and purchase decisions.
- 🛠 پنل مدیریت: admin-only access; existing grouped admin dashboard, Xray Center, and finance access remain intact.

## Removed regressions

- Free test is restored to the home screen.
- My services remains top-level and is not hidden under account.
- Renewal is top-level and starts from a renewable services list when no specific service is selected.
- Account remains available but no longer crowds out VPN service actions.
- Home copy is compact and only shows wallet balance, active service count, and expiring count when applicable.
- Coupon is not a top-level home button; it remains in checkout and account.

## Callback compatibility notes

Old callback routes continue to work through compatibility redirects:

- `account` routes to the account screen.
- `accounts` routes to `account.details` / my services.
- `renew` and `account:renew` route to the new top-level renewal picker.
- Existing `nav:*`, checkout coupon, buy, payment, Xray subscription/config, and admin callbacks are unchanged.

## Manual QA checklist

- Open `/start` as a normal user and confirm the compact home summary fits on a mobile screen.
- Confirm home shows 📦 خرید سرویس and 🎁 دریافت تست رایگان in the first row.
- Confirm 🧩 سرویس‌های من opens the active services list directly.
- Confirm ♻️ تمدید سرویس opens renewable services and selecting one enters the existing renewal flow.
- Confirm 👤 حساب من shows wallet balance, active service count, membership date, wallet, transactions, coupon, user info, and home.
- Confirm coupon is absent from top-level home but present in account and checkout.
- Confirm an applied checkout coupon shows code, discount, final amount, and a remove/change path.
- Confirm wallet remains available from both home and account.
- Confirm free-test eligibility rules still apply before provisioning.
- Confirm old inline callbacks in older Telegram messages still route to valid screens.
- Confirm admin users still see 🛠 پنل مدیریت and can access dashboard, Xray Center, and finance.
