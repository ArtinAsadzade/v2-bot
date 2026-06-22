# Telegram UI/UX Redesign

## Design system

The redesign uses Telegram-safe visual semantics: emojis, concise labels, grouping, and button placement. Telegram inline keyboards cannot use arbitrary background colors, so color meaning is represented through emoji prefixes.

## Icon meanings

- 🟢 safe, active, confirm
- 🔵 information and details
- 🟡 pending or warning state
- 🔴 danger, delete, disable
- ⚫ disabled or unavailable
- ✅ success
- ⚠️ needs review
- ❌ cancel or error
- 🔄 refresh or retry
- 🛠 admin tools or repair
- 📊 stats
- 💳 wallet/payment
- 🧾 invoice
- 📦 products/services
- 👤 account
- 🧩 Xray
- 🎟 coupons
- 🆘 support

## User flow text examples

### Home

```text
سلام دوست عزیز 🌿

━━━━━━━━━━━━━━

⚡ دسترسی سریع
💳 موجودی کیف پول: 100,000 تومان
📦 سرویس‌های فعال: 2
یکی از گزینه‌های زیر را انتخاب کنید.
```

Buttons:

```text
📦 خرید سرویس | 👤 اکانت‌های من
💳 کیف پول | 🎟 کد تخفیف
🆘 پشتیبانی | 📘 راهنما
```

### Product detail

```text
📦 مشخصات سرویس
📦 نام سرویس: پلن یک‌ماهه
📊 حجم: 100GB
⏳ مدت: 30 روز

━━━━━━━━━━━━━━

💳 قیمت
💳 قیمت: 200,000 تومان
🎟 تخفیف: 20,000 تومان
✅ مبلغ نهایی: 180,000 تومان
```

Buttons:

```text
💳 خرید با کیف پول
🧾 پرداخت آنی
🎟 وارد کردن کد تخفیف
↩️ برگشت | 🏠 خانه
```

### My accounts

```text
📦 سرویس یک‌ماهه
📊 مصرف: 20GB / 100GB
⏳ باقی‌مانده: 18 روز
وضعیت: 🟢 فعال
📅 انقضا: ۱۴۰۵/۰۴/۱۰
```

Buttons:

```text
🔗 لینک اشتراک | 📋 کانفیگ‌ها
🔄 بروزرسانی وضعیت | ♻️ تمدید
🆘 پشتیبانی | 🏠 خانه
```

## Admin flow examples

### Dashboard

```text
📊 داشبورد مدیریت

━━━━━━━━━━━━━━

📊 شاخص‌های امروز
💰 درآمد امروز: 2,000,000 تومان
🧾 سفارش‌های امروز: 12
⏳ پرداخت‌های در انتظار: 3
👥 کاربران فعال: 421

━━━━━━━━━━━━━━

🧩 وضعیت Xray
🟢 API سالم
🆘 تیکت‌های باز: 4
```

Buttons:

```text
📦 محصولات | 📥 موجودی اکانت‌ها
🧩 Xray Center | 💳 پرداخت‌ها
👥 کاربران | 🎟 کدهای تخفیف
🆘 تیکت‌ها | ⚙️ تنظیمات
```

### Dangerous confirmation

```text
⚠️ آیا مطمئن هستید؟
عملیات: حذف محصول
مورد اثر: پلن یک‌ماهه
این عملیات ممکن است قابل بازگشت نباشد.
```

Buttons:

```text
✅ تایید | ❌ لغو
↩️ برگشت به پنل ادمین
```

## Callback compatibility notes

- Existing navigation callback format `nav:<view>` remains unchanged.
- Existing purchase callbacks such as `buy:confirm`, `buy:instant`, and `buy:cancel_existing` remain available.
- Existing Xray callbacks such as `xray:sub`, `xray:qr`, and `xray:configs` remain available.
- New keyboard helpers centralize wording but do not require database or payment semantics changes.

## Manual QA checklist

- [ ] `/start`
- [ ] home menu
- [ ] product list/detail
- [ ] coupon apply/remove
- [ ] wallet top-up
- [ ] wallet purchase
- [ ] instant payment invoice
- [ ] my accounts
- [ ] config display
- [ ] support
- [ ] admin dashboard
- [ ] admin products
- [ ] admin payments
- [ ] admin users
- [ ] admin coupons
- [ ] admin Xray center
- [ ] dangerous action confirmation
