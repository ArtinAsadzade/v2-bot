# Xray repeat-purchase repair guide

Do not hard-delete historical Xray purchase records automatically. If a user received an old client for a later purchase, repair the data manually with an audited migration or admin script:

1. Identify the affected `Order`, `PaymentInvoice`, `OrderItem`, and `XrayClient` rows.
2. Keep completed historical orders intact for accounting.
3. For each later completed order that incorrectly points at a previous `XrayClient`, create a replacement 3x-ui client with a new `clientEmail` scoped to that order.
4. Insert or update only that order's `XrayClient` and `OrderItem` to point to the replacement client.
5. Record an `auditLog` entry with the old client id, replacement client id, order id, invoice id, and operator id.
6. Re-send the repaired account details to the user after verifying the panel client exists.

Idempotency must stay scoped to the same invoice/order/delivery attempt; never merge completed orders just because the same user bought the same product.
