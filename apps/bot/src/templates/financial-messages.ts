import { code } from '../formatters/markdown.js';
import { formatPersianDate, formatToman } from '../formatters/date.js';
import { statusCard, successMessage, errorState } from '../ui/components.js';

export type WalletCardInput = {
  balanceToman: number | bigint | string;
  frozenBalanceToman?: number | bigint | string;
  lifetimeDepositsToman?: number | bigint | string;
};

const tomanValue = (value: number | bigint | string = 0): string => formatToman(Number(value));

export const walletCardTemplate = (wallet: WalletCardInput): string =>
  statusCard({
    title: 'کیف پول شما',
    body: 'مدیریت موجودی، پرداخت‌ها و تاریخچه مالی شما در یک نگاه.',
    rows: [
      ['موجودی قابل استفاده', tomanValue(wallet.balanceToman)],
      ['موجودی رزروشده', tomanValue(wallet.frozenBalanceToman)],
      ['واریزی کل', tomanValue(wallet.lifetimeDepositsToman)],
    ],
  });

export const invoiceCardTemplate = (invoice: {
  amountToman: number | bigint | string;
  assetAmount?: string | null;
  asset?: string;
  payAddress?: string | null;
  expiresAt: string | Date;
}): string =>
  [
    'رسید پرداخت کریپتو',
    '',
    `مبلغ: ${tomanValue(invoice.amountToman)}`,
    invoice.assetAmount
      ? `معادل تقریبی: ${invoice.assetAmount} ${invoice.asset ?? 'USDT'}`
      : undefined,
    invoice.payAddress ? `آدرس پرداخت:\n${code(invoice.payAddress)}` : undefined,
    `مهلت پرداخت: ${formatPersianDate(invoice.expiresAt)}`,
    '',
    'پس از تأیید شبکه، کیف پول شما خودکار شارژ می‌شود.',
  ]
    .filter(Boolean)
    .join('\n');

export const paymentPendingTemplate = (confirmations = 0, requiredConfirmations = 20): string =>
  statusCard({
    title: 'پرداخت در حال بررسی است',
    body: 'تراکنش شما دیده شده و منتظر تأیید نهایی شبکه هستیم.',
    rows: [['تأیید شبکه', `${confirmations}/${requiredConfirmations}`]],
  });

export const paymentSuccessTemplate = (amountToman: number | bigint | string): string =>
  successMessage(`پرداخت با موفقیت تأیید شد و ${tomanValue(amountToman)} به کیف پول شما اضافه شد.`);

export const paymentFailedTemplate = (): string =>
  errorState(
    'پرداخت تأیید نشد. اگر مبلغ از کیف پول شما کسر شده، رسید را برای پشتیبانی ارسال کنید.',
  );

export const transactionCardTemplate = (transaction: {
  type: string;
  amountToman: number | bigint | string;
  status: string;
  createdAt: string | Date;
  balanceAfter?: number | bigint | string;
}): string =>
  statusCard({
    title: 'جزئیات تراکنش',
    rows: [
      ['نوع', transaction.type],
      ['مبلغ', tomanValue(transaction.amountToman)],
      ['وضعیت', transaction.status],
      ['موجودی بعد از تراکنش', tomanValue(transaction.balanceAfter)],
      ['زمان', formatPersianDate(transaction.createdAt)],
    ],
  });
