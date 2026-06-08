# Payment System Hardening Audit

## Root causes found

1. Payment, wallet, and delivery logic were split across handlers/services instead of one financial service boundary. Wallet purchases used `PurchaseService`, instant gateway callbacks used `PaymentInvoiceService`, and crypto approvals called wallet crediting directly.
2. Instant payment callback processing performed callback handling and business fulfillment in the same class but without a clearly named single source of truth for verification, wallet crediting, product purchase, account delivery, and completion.
3. Wallet mutation records existed, but balance changes did not consistently emit general `AuditLog` records with actor, reason, before/after balance, and a reference.
4. Product delivery logic for instant payments duplicated wallet purchase delivery logic, increasing the chance that validation, inventory reservation, order creation, and sold marking diverge.
5. Inventory reservation used atomic `updateMany` guards, but there was no shared reservation/delivery implementation and no reservation timeout release helper.
6. Admin crypto approval used an atomic status transition but credited the wallet directly, bypassing unified payment audit events.
7. Coupon validation checked active/expired/limits, but final usage increment was not centralized with product purchase and financial audit logging.

## Security issues found

- Double callback and replay risk: instant payment callbacks could be retried and returned a generic English duplicate message; processing state was not routed through a hardened `completePayment()` boundary.
- Duplicate balance audit risk: wallet credits/debits generated `WalletTransaction` rows only, so admin/support reconciliation did not have a complete `AuditLog` trail.
- Divergent order logic risk: instant purchases had their own `deliverProduct()` path separate from wallet purchases.
- Race-condition risk: concurrent purchases relied on duplicated inventory guards; future changes to one path could accidentally remove atomic reservation.
- Crypto approval consistency risk: admin approval did not use the payment layer and therefore did not share wallet-credit audit semantics.
- Store/user validation gaps: wallet and invoice purchase paths did not consistently verify store enabled and user ban status from one central place.

## Hardening implemented

- Added `PaymentService` as the central financial boundary for invoice creation, payment verification, wallet credit/debit, product purchase, inventory reservation/sale, and payment completion.
- Routed wallet purchases through `PaymentService.purchaseProductWithWallet()`.
- Routed instant gateway callbacks through `PaymentService.completePayment()`.
- Routed crypto admin approval wallet crediting through `PaymentService.creditWallet()`.
- Added Persian duplicate-processing response: `⚠️ این پرداخت قبلاً پردازش شده است.`
- Preserved atomic state transitions with guarded `updateMany` calls for invoices, deposits, wallet debit, inventory reservation, and inventory sale.
- Added `AuditLog` entries for wallet credit/debit, invoice lifecycle events, inventory reservation/sale, coupon use, and product purchase.
- Added a shared expired-reservation release helper for reserved inventory timeout recovery.

## Database changes

Prisma schema was updated to add `CouponUsage.usageSlot` and `@@unique([couponId, userId, usageSlot])`, making concurrent per-user coupon claims first-writer-wins at the database level. Existing models already supported:

- `PaymentInvoice` for instant gateway invoices and idempotent status transitions.
- `WalletTransaction` for wallet ledger entries.
- `AuditLog` and `PaymentAuditLog` for auditability.
- `ProductAccount` status flow: `available → reserved → sold`.
- `Deposit` statuses: `pending/submitted/approved/rejected/expired`.
- `CouponUsage` and coupon counters.

## Validation checklist

- Wallet payment uses the centralized purchase path.
- Crypto deposit approval uses centralized wallet crediting.
- Instant payment invoice creation and callback completion use centralized payment methods.
- Product active/category active/store active/user not banned/inventory available validations are centralized.
- Wallet debits cannot make balances negative.
- Wallet mutations create both `WalletTransaction` and `AuditLog`.
- Inventory reservation and sold marking use guarded atomic updates.
- Admin approval is first-action-wins through status-guarded updates.
- Callback replay returns a Persian already-processed message.
- Coupon amount and usage data are stored on orders and audited.

## Remaining risks

1. MongoDB/Prisma does not provide SQL-style `SELECT FOR UPDATE`; this implementation uses atomic guarded updates and transactions. Production MongoDB must run as a replica set for transactions.
2. Gateway verification currently validates callback token and stored gateway amount. If the gateway supports a server-side verify endpoint, add a direct verify API call before marking invoices paid.
3. Crypto deposits still rely on admin receipt approval rather than blockchain confirmation. For high volume, integrate chain transaction hash validation and reject reused hashes.
4. Optional unique idempotency keys for wallet transactions would further strengthen ledger replay protection if the schema can be migrated safely with existing data.
5. Before applying the new coupon unique index to production, scan existing `CouponUsage` data for duplicate `(couponId, userId, usageSlot=0)` rows and backfill slots where needed.

## Full payment + coupon audit update

This pass hardens the product/wallet/instant-payment/coupon relationship with these production rules:

- Product instant-payment invoices are now quoted server-side from the product price and optional coupon before the invoice is created. `PaymentInvoice.amount` stores the final payable amount, not the raw product price.
- `PaymentInvoice` now stores reconciliation fields: `originalAmount`, `discountAmount`, `couponId`, and `couponCode`, so the gateway amount, order amount, and coupon discount can be audited after payment.
- Wallet top-up invoice creation does not accept coupon input; bonus-campaign top-ups remain intentionally unsupported by the default top-up path.
- Payment callbacks check invoice amount integrity (`originalAmount - discountAmount == amount`), gateway amount equality, and any callback-reported paid amount before fulfillment. Mismatches are marked `FAILED`, audited, and do not deliver products or credit wallets.
- Invoice completion is idempotent: callback processing still locks only `PENDING` invoices, then moves them through `PAID` to `COMPLETED`; duplicate callbacks are ignored.
- Coupon usage is still written only inside successful product fulfillment, after wallet debit or gateway payment success, never when a coupon is entered or when a payment link is opened.
- Admin invoice details now expose original amount, discount amount, coupon code, final amount, payment type, status, user, product, order, gateway amount, and audit events.

### Required scenario coverage

- 150k product + 20% coupon => invoice final amount is 120k.
- 150k product + 50k fixed coupon => invoice final amount is 100k.
- Expired/inactive coupons are rejected during quote validation.
- Duplicate callback cannot redeliver a product or re-credit a wallet because only `PENDING` invoices can be locked for fulfillment.
- Direct payment delivery and wallet top-up credit both happen only after callback amount integrity succeeds.
- CouponUsage is created only during successful product fulfillment.
