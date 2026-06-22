# UX Information Architecture Audit

## User top-level menu

| Old item | Decision | New location / wording | Notes |
|---|---|---|---|
| 📦 خرید سرویس | Keep top-level | 📦 خرید سرویس | Primary purchase intent. |
| 👤 اکانت‌های من | Rename + move semantics | top-level 👤 حساب من; inside 🧩 سرویس‌های من | Old callbacks remain accepted through `account.details`. |
| 💳 کیف پول | Move | 👤 حساب من → 💳 کیف پول | Not a top-level intent. |
| ➕ شارژ کیف پول | Move | 👤 حساب من → ➕ شارژ کیف پول | Direct path retained inside account. |
| 📜 تراکنش‌ها | Move | 👤 حساب من → 📜 تراکنش‌ها | Wallet history stays accessible. |
| 🎟 کد تخفیف | Remove from top-level | Checkout/product detail and 👤 حساب من info screen | Coupon no longer opens products. |
| 👤 اطلاعات کاربری | Move | 👤 حساب من → 👤 اطلاعات کاربری | Same account view. |
| 🎁 دعوت دوستان | Move | 👤 حساب من → 🎁 دعوت دوستان | Existing referral callback retained. |
| 🆘 پشتیبانی | Keep top-level | 🆘 پشتیبانی | High-frequency help intent. |
| 📘 راهنما | Keep top-level | 📘 راهنما | Learning intent. |
| 🛠 پنل مدیریت | Admin-only top-level | 🛠 پنل مدیریت | Visible only for admins. |

## Required user architecture

Top-level:

1. 📦 خرید سرویس · 👤 حساب من
2. 🆘 پشتیبانی · 📘 راهنما
3. 🛠 پنل مدیریت (admins only)

Account:

- 🧩 سرویس‌های من
- 💳 کیف پول
- ➕ شارژ کیف پول
- 📜 تراکنش‌ها
- 🎟 کد تخفیف
- 👤 اطلاعات کاربری
- 🎁 دعوت دوستان
- ↩️ برگشت / 🏠 خانه

## Coupon architecture

Coupon is a checkout affordance, not a top-level destination. Product and checkout screens keep coupon entry actions. The standalone coupon info screen states: «کد تخفیف هنگام خرید سرویس اعمال می‌شود.» and routes users to purchase, account, or home.

## Admin architecture

Admin top-level is grouped by operational intent:

- 📊 داشبورد
- 📦 محصولات
- 🧩 Xray Center
- 👥 کاربران
- 💳 مالی
- 🆘 تیکت‌ها
- ⚙️ تنظیمات

Coupons, invoices, deposits, wallets, payment gateway, and transactions are grouped under مالی. Inventory remains under products/store. Dangerous actions remain on confirmation screens.
