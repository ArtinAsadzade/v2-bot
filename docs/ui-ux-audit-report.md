# Telegram UI/UX Audit Report

This audit was created before code changes for the Telegram UI/UX redesign. Scope: user panel, admin panel, messages, keyboards, navigation, and dangerous-action clarity. The goal is visual consistency and safer workflows without changing business logic, database semantics, callback compatibility, payment, delivery, Xray, wallet, coupon, admin, or support behavior.

## Audit framework

For every flow, the same risks were checked:

- Current problem: visual hierarchy, noisy text, inconsistent emoji semantics, scattered actions.
- Confusing text/buttons: labels that do not clearly say what happens next.
- Missing back/cancel actions: screens without an obvious escape path.
- Missing confirmations: irreversible or risky actions that should ask again.
- Dangerous actions without warning: delete/disable/cleanup/repair/block operations.
- Suggested improved layout: concise sections, grouped buttons, safe/info/warning/danger emojis.

---

## 1. User home menu

### Current problem
- The home screen mixes dashboard data, referrals, route hints, and several unrelated actions.
- The primary user tasks are not emphasized enough: buy service, see accounts, wallet, coupon, support.
- Some labels use older wording such as shop/store while newer flows use service/product wording.

### Confusing text/buttons
- `🛒 فروشگاه` can be less direct than `📦 خرید سرویس`.
- `🎫 پشتیبانی` and `🆘 پشتیبانی` should be standardized.
- Referral and free/test account are useful but should not visually compete with core actions.

### Missing back/cancel actions
- Home itself does not need back, but it should always be reachable via `🏠 خانه` from child screens.

### Missing confirmations
- Not applicable.

### Dangerous actions without warning
- Not applicable.

### Suggested improved layout
Text:
- Welcome line.
- Wallet balance.
- Active service count.
- One short instruction.

Buttons:
- Row 1: `📦 خرید سرویس` | `👤 اکانت‌های من`
- Row 2: `💳 کیف پول` | `🎟 کد تخفیف`
- Row 3: `🆘 پشتیبانی` | `📘 راهنما`
- Optional admin row: `📊 پنل مدیریت`

---

## 2. Product list/detail

### Current problem
- Product browsing can feel like a list of records instead of clear service cards.
- Status/availability is not always visually separated from price and specs.

### Confusing text/buttons
- Product actions should consistently use `🔍 جزئیات` and `🛒 خرید`.
- Back labels should consistently return to categories or previous product list.

### Missing back/cancel actions
- Product detail should always include `↩️ برگشت` and `🏠 خانه`.
- Purchase-related screens should include `❌ لغو خرید`.

### Missing confirmations
- Final purchase confirmation should clearly show final amount before wallet charge or invoice flow.

### Dangerous actions without warning
- User product browsing has no dangerous actions.

### Suggested improved layout
Product card:
- `📦 {title}`
- `📊 حجم: ...`
- `⏳ مدت: ...`
- `💳 قیمت: ...`
- `🟢 موجود` / `⚫ ناموجود`

Product detail:
- Section title `📦 مشخصات سرویس`
- Traffic, duration, price, discount if applied, final amount.
- Buttons: wallet purchase, instant invoice, coupon entry, back.

---

## 3. Purchase flow

### Current problem
- Users may not know which step they are in: selecting service, payment, confirmation, provisioning, delivery.
- Delivery/provisioning messages can be technical when Xray or panel operations are involved.

### Confusing text/buttons
- Payment choices should be named by outcome: `💳 خرید با کیف پول`, `🧾 پرداخت آنی`.
- Retry and status-check actions should use `🔄` consistently.

### Missing back/cancel actions
- Each purchase step should have one of: back to product, cancel purchase, home.

### Missing confirmations
- Wallet purchase must have a final confirmation screen before charging balance.

### Dangerous actions without warning
- No admin-danger action, but charging wallet is high-impact and needs explicit confirmation.

### Suggested improved layout
Steps:
1. انتخاب سرویس
2. انتخاب پرداخت
3. تایید نهایی
4. ساخت اکانت
5. تحویل

Messages:
- `پرداخت تایید شد، در حال آماده‌سازی سرویس...`
- `در حال ساخت اکانت...`
- `✅ سرویس شما آماده شد.`

---

## 4. Wallet top-up

### Current problem
- Wallet top-up can be unclear if minimum amount, predefined amount, custom amount, and transaction history are not grouped.

### Confusing text/buttons
- Use `💳 شارژ 100,000` and `💳 شارژ 200,000` for predefined values.
- Use `💳 مبلغ دلخواه` for custom amount.

### Missing back/cancel actions
- Top-up amount entry and invoice screens should include cancel/back/home.

### Missing confirmations
- Invoice creation should show final payable amount before sending users to payment.

### Dangerous actions without warning
- No irreversible danger, but payment should have status/retry/support actions.

### Suggested improved layout
- Current balance.
- Minimum top-up.
- Predefined amount rows.
- Custom amount and transaction history.

---

## 5. Coupon flow

### Current problem
- Applied coupon, discount amount, and final price may not be visible enough throughout checkout.

### Confusing text/buttons
- `🎟 وارد کردن کد تخفیف`, `❌ حذف کد تخفیف`, `✅ اعمال شد` should be standardized.

### Missing back/cancel actions
- Coupon entry should return to product/checkout.

### Missing confirmations
- Removing a coupon is reversible, so a confirmation is optional; showing the updated final amount is required.

### Dangerous actions without warning
- User coupon flow has no dangerous actions.

### Suggested improved layout
- Product price.
- Coupon code/status.
- Discount amount.
- Final price.
- Apply/remove coupon actions.

---

## 6. My accounts

### Current problem
- Accounts need to read as cards, not raw technical rows.
- Broken Xray/client/subscription states should be clear without exposing too much technical detail to users.

### Confusing text/buttons
- Account actions should be consistent: subscription link, configs, refresh, renew, support.
- Broken account should show `⚠️ نیازمند بررسی` and `🛠 درخواست بررسی`.

### Missing back/cancel actions
- Account list and detail screens should include home/back.

### Missing confirmations
- Renewal should show price and final confirmation before charging.

### Dangerous actions without warning
- No dangerous user action; renewal/payment needs final confirmation.

### Suggested improved layout
Card:
- Service title.
- Used/total traffic.
- Remaining days.
- Status.
- Expiry date.

Buttons:
- `🔗 لینک اشتراک`, `📋 کانفیگ‌ها`, `🔄 بروزرسانی وضعیت`, `♻️ تمدید`, `🆘 پشتیبانی`.

---

## 7. Config display

### Current problem
- Subscription URLs, individual configs, warnings, and technical errors can overload the user.

### Confusing text/buttons
- Separate `🔗 لینک اشتراک` from `📋 کانفیگ‌ها`.
- Use copy-friendly code blocks for URLs/configs.

### Missing back/cancel actions
- Config display should include back to account and home.

### Missing confirmations
- Not applicable.

### Dangerous actions without warning
- Not applicable.

### Suggested improved layout
- Show subscription link first.
- Then config buttons.
- User-friendly warning if subscription URL fails, panel API fails, client is missing, or inbound was deleted.

---

## 8. Free/test account

### Current problem
- Test-account status and limits may not be visually distinct from paid services.

### Confusing text/buttons
- Use `🆓 اکانت تست`, `📦 دریافت سرویس`, and clear unavailable labels.

### Missing back/cancel actions
- Claim and status screens should include home/back.

### Missing confirmations
- Claiming a free account is usually safe, but if limited to one-time use the screen should state that before claiming.

### Dangerous actions without warning
- Not applicable for user flow.

### Suggested improved layout
- Eligibility status.
- Test duration/traffic.
- One clear claim button.
- Support fallback if provisioning fails.

---

## 9. Support flow

### Current problem
- Users need a clear choice between opening a new ticket, viewing existing tickets, and contacting support about a specific account/order.

### Confusing text/buttons
- Standardize on `🆘 پشتیبانی` and `🎫 تیکت‌ها`.

### Missing back/cancel actions
- Ticket creation state should have `❌ لغو`.
- Support home should include `🏠 خانه`.

### Missing confirmations
- Closing tickets should require confirmation.

### Dangerous actions without warning
- Admin-side ticket close/delete actions should be confirmed if destructive.

### Suggested improved layout
- New ticket.
- My tickets.
- Account-related support.
- Back/home.

---

## 10. Admin dashboard

### Current problem
- Admin dashboard should prioritize operational health: revenue, orders, pending payments, active users, Xray health, support tickets.
- Existing grouping may be too broad and not aligned with daily admin tasks.

### Confusing text/buttons
- Use direct labels: `📦 محصولات`, `📥 موجودی`, `🧩 Xray Center`, `💳 پرداخت‌ها`, `👥 کاربران`, `🎟 تخفیف‌ها`, `🆘 تیکت‌ها`, `⚙️ تنظیمات`.

### Missing back/cancel actions
- Admin child screens need `↩️ برگشت به پنل ادمین` and/or `🏠 خانه`.

### Missing confirmations
- Dashboard itself has no dangerous action.

### Dangerous actions without warning
- Dangerous shortcuts must not run directly from dashboard.

### Suggested improved layout
- Top metrics section.
- Health section.
- Grouped two-column buttons.

---

## 11. Admin products

### Current problem
- Categories, Xray products, manual inventory products, and inactive products should be visually separated.

### Confusing text/buttons
- Delete/disable actions must use danger labels: `🔴 حذف`, `🔴 غیرفعال‌سازی`.

### Missing back/cancel actions
- Product lists, detail, edit flows, and forms need back/cancel.

### Missing confirmations
- Delete product and disable product require confirmation.

### Dangerous actions without warning
- Delete product, disable product, product cleanup.

### Suggested improved layout
- Categories.
- Products.
- Xray products.
- Manual inventory products.
- Inactive products.
- Add/edit actions separated from danger actions.

---

## 12. Admin inventory

### Current problem
- Manual inventory can be confused with Xray provisioning inventory.
- Low stock should be highlighted.

### Confusing text/buttons
- Use `📥 موجودی اکانت‌ها`, `📤 افزودن موجودی`, `⚠️ کم‌موجود`.

### Missing back/cancel actions
- Add/import inventory flows need cancel and admin back.

### Missing confirmations
- Bulk delete/cleanup must be confirmed.

### Dangerous actions without warning
- Deleting inventory, bulk cleanup, marking accounts used.

### Suggested improved layout
- Summary: available/sold/low stock.
- Product filter.
- Import/add actions.
- Danger zone separated at bottom.

---

## 13. Admin users

### Current problem
- Admin user detail should show balance, orders, active accounts, support history, and block status clearly.

### Confusing text/buttons
- Block/unblock should use `🔴 مسدودسازی` and `🟢 رفع مسدودی`.

### Missing back/cancel actions
- Search and detail screens need back/admin home.

### Missing confirmations
- Blocking a user requires confirmation.

### Dangerous actions without warning
- Block user, balance adjustment if implemented, data cleanup.

### Suggested improved layout
- User identity.
- Balance.
- Orders/accounts.
- Support tickets.
- Quick actions.
- Danger zone.

---

## 14. Admin payments/income

### Current problem
- Income needs gross amount, discount amount, and actual paid amount. Today revenue should be final paid amount.

### Confusing text/buttons
- Separate invoices, deposits, failed payments, and income reports.

### Missing back/cancel actions
- Payment detail screens need admin back/home.

### Missing confirmations
- Manual payment approval/rejection should be confirmed if it affects balance/order delivery.

### Dangerous actions without warning
- Manual approve/reject, cleanup stale payments.

### Suggested improved layout
- Today revenue (actual paid).
- Gross amount.
- Discount amount.
- Pending payments.
- Failed payments.
- Reports.

---

## 15. Admin coupons

### Current problem
- Coupon state, usage, expiration, and scope should be visible at a glance.

### Confusing text/buttons
- Delete/disable coupon labels must be danger-coded.

### Missing back/cancel actions
- Coupon form screens need cancel/admin back.

### Missing confirmations
- Delete coupon and disable coupon require confirmation.

### Dangerous actions without warning
- Delete coupon, disable coupon, reset usage.

### Suggested improved layout
- Active coupons.
- Expired/inactive coupons.
- Usage stats.
- Create/edit actions.
- Danger zone.

---

## 16. Admin support

### Current problem
- Ticket status, user context, related order/account, and priority need clearer grouping.

### Confusing text/buttons
- Use `🟡 در انتظار پاسخ`, `✅ بسته شد`, `⚠️ نیازمند بررسی`.

### Missing back/cancel actions
- Ticket detail/reply screens need admin support back and admin dashboard.

### Missing confirmations
- Close/delete ticket actions should be confirmed if irreversible.

### Dangerous actions without warning
- Delete ticket, close ticket with no reply if considered irreversible.

### Suggested improved layout
- Open tickets first.
- Assigned/answered/closed filters.
- Ticket detail with user, account/order, message, last activity.
- Reply/close/escalate actions.

---

## 17. Admin Xray panel/settings

### Current problem
- Xray settings and clients contain technical data that needs admin-friendly grouping.
- Dangerous repair/cleanup actions must be visually separated.

### Confusing text/buttons
- Use `🧩 Xray Center` as the central entry.
- Use `🟢 API سالم` / `🔴 API قطع`.
- `Repair`, `cleanup`, and `sync` should not look like normal navigation.

### Missing back/cancel actions
- Xray settings, client list, checks, and repair screens need admin back/home.

### Missing confirmations
- Repair all Xray clients and cleanup stale/broken records require confirmation.

### Dangerous actions without warning
- Repair all clients, cleanup broken/stale records, disabling panel config.

### Suggested improved layout
- API health.
- Inbound count.
- Missing clients.
- Broken subscriptions.
- Sync report.
- Safe tools: test connection, list inbounds, check client.
- Danger zone: repair all, cleanup stale.
