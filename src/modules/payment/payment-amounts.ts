import type { PaymentInvoice } from "@prisma/client";

export function assertPositiveAmount(amount: number) {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error("مبلغ پرداخت معتبر نیست");
}

export function resolveInvoiceAmounts(data: { amount: number; originalAmount?: number; discountAmount?: number }) {
  assertPositiveAmount(data.amount);
  const originalAmount = data.originalAmount ?? data.amount;
  const discountAmount = data.discountAmount ?? 0;
  if (originalAmount - discountAmount !== data.amount) throw new Error("مبلغ نهایی فاکتور با تخفیف همخوانی ندارد");
  return { originalAmount, discountAmount, finalAmount: data.amount };
}

export function assertInvoiceAmountIntegrity(invoice: Pick<PaymentInvoice, "amount" | "originalAmount" | "discountAmount" | "gatewayAmount">) {
  const expectedAmount = invoice.originalAmount > 0 ? invoice.originalAmount - invoice.discountAmount : invoice.amount;
  if (expectedAmount !== invoice.amount) return { ok: false as const, reason: "stored_final_amount_mismatch", expectedAmount };
  if (invoice.gatewayAmount !== null && invoice.gatewayAmount !== undefined && invoice.gatewayAmount !== invoice.amount)
    return { ok: false as const, reason: "gateway_amount_mismatch", expectedAmount };
  return { ok: true as const, expectedAmount };
}
