# Refactor Phase 3 Payment Extraction Report

## Scope

Started the Phase 3 low-risk extraction for the oversized payment module at `src/modules/payment/payment.service.ts`.

## Line count

- Old `payment.service.ts` line count: 2609 lines.
- New `payment.service.ts` line count: 2378 lines.
- Net reduction: 231 lines.

## Files created

- `src/modules/payment/payment.types.ts`
- `src/modules/payment/payment-amounts.ts`
- `src/modules/payment/gateway-payment.service.ts`
- `src/modules/payment/payment-repository.ts`
- `docs/refactor-phase-3-payment-extraction-report.md`

## What moved where

### `payment.types.ts`

Moved local payment and delivery types out of the orchestrator:

- `PaymentGatewayInput`
- `TxClient`
- `AuditData`
- `PurchaseMethod`
- `DeliveredAccount`
- `ProductDeliverySuccess`
- `ProductDeliveryFailure`
- `ProductDeliveryResult`
- `assertProductDeliverySuccess`
- `ProductInvoiceQuote`
- `InvoiceNotificationPayload`

The `ProductDeliveryResult` discriminated union remains strongly typed with `ok: true` / `ok: false` narrowing.

### `payment-amounts.ts`

Moved pure amount integrity helpers:

- `assertPositiveAmount`
- `resolveInvoiceAmounts`
- `assertInvoiceAmountIntegrity`

These helpers have no Prisma access, no Telegram context, and no external API calls.

### `gateway-payment.service.ts`

Moved gateway URL, response parsing, callback URL, JSON serialization, and invoice request helpers:

- Gateway error classes
- `normalizeBaseUrl`
- `assertValidHttpUrl`
- `validateUrl`
- `parseGatewayResponse`
- `invoiceCallbackUrl`
- `safeJson`
- `requestGatewayInvoice`

The gateway request payload remains `{ price, callback_url }`, the endpoint remains `/invoice/create`, the `X-API-KEY` header is unchanged, and callback URL query parameters remain `invoice_id` and `token`.

### `payment-repository.ts`

Moved repository/audit helpers:

- `DbClient`
- `rawPaymentInvoiceProjection`
- `audit`

No schema, index, or query semantics were changed.

## Backward compatibility

- `payment.service.ts` still exports the existing public service classes.
- Moved payment types are re-exported from `payment.service.ts` to preserve existing import paths.
- `PaymentService.requestGatewayInvoice` remains available as a static facade and delegates to the extracted gateway helper.

## Behavior intentionally preserved

- Payment and delivery orchestration remains in `payment.service.ts`.
- Callback URL format and query parameter semantics are preserved.
- Gateway invoice API payload and headers are preserved.
- Provider `payId` storage semantics are preserved.
- Wallet deduction timing was not changed.
- Discount usage timing was not changed.
- X-UI delivery state machine and delivery semantics were not split or changed.
- No Prisma/Mongo schema or index changes were made.
- `dist/**` was not touched.

## Risky parts intentionally left untouched

- Core product delivery state machine.
- Wallet purchase orchestration and idempotency behavior.
- Instant callback success/duplicate handling.
- Xray/X-UI provisioning, verification, and account delivery flow.
- Coupon confirmation timing inside successful order fulfillment.
- Existing Prisma updateMany/findFirst idempotency patterns beyond pure helper extraction.

## Validation results

- `npm run build`: passed.
- `npx tsc --noEmit`: passed.
- `npx prisma generate`: passed.
- `git diff --check`: passed.
- `npx prisma validate`: skipped because `DATABASE_URL` is not present in the environment.

## Manual QA checklist

Run these scenarios in a staging bot before release:

- Wallet purchase success.
- Wallet insufficient balance.
- Duplicate wallet purchase.
- Instant invoice create.
- Instant callback success.
- Duplicate instant callback.
- Coupon applied with wallet.
- Coupon applied with instant payment.
- Admin today income.
- My accounts after purchase.

## Next recommended phase

Continue Phase 3 with another low-risk extraction pass focused on invoice lifecycle and callback idempotency helpers. Keep the public facade in `payment.service.ts`, preserve all update filters exactly, and avoid splitting the delivery state machine until enough surrounding helpers have been isolated and covered by tests.
