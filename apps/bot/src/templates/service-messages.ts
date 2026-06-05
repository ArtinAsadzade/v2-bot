import { formatPersianDate, formatToman } from '../formatters/date.js';
import { statusCard, successMessage } from '../ui/components.js';

import type { ProvisionResultDto, ServiceSummaryDto } from '../services/api-client.js';

const gbFromBytes = (usedBytes: string, limitGb: number): string => {
  const usedGb = Number(usedBytes) / (1024 ** 3);
  return `${usedGb.toFixed(2)} / ${limitGb} GB`;
};

export const serviceListTemplate = (services: ServiceSummaryDto[]): string => {
  if (services.length === 0) {
    return '📡 سرویس‌های شما\n\nهنوز سرویس فعالی ندارید. از بخش خرید اشتراک، اولین سرویس خود را تهیه کنید.';
  }
  const lines = services.map(
    (s, i) =>
      `${i + 1}. ${s.productName} (${s.protocol})\n   وضعیت: ${s.status} | ترافیک: ${gbFromBytes(s.usedBytes, s.trafficLimitGb)}\n   انقضا: ${formatPersianDate(s.expiresAt)}`,
  );
  return ['📡 سرویس‌های شما', '', ...lines].join('\n');
};

export const serviceDetailTemplate = (service: Record<string, unknown>): string => {
  const xray = service.xrayClient as Record<string, unknown> | undefined;
  const product = service.product as { name: string; protocol: string } | undefined;
  return statusCard({
    title: `🛡️ ${product?.name ?? 'سرویس'}`,
    body: 'جزئیات اشتراک و لینک‌های اتصال شما',
    rows: [
      ['پروتکل', product?.protocol ?? '-'],
      ['وضعیت', String(service.status)],
      ['ترافیک', gbFromBytes(String(service.usedBytes ?? 0), Number(service.trafficLimitGb ?? 0))],
      ['انقضا', formatPersianDate(String(service.expiresAt))],
      ['لینک اشتراک', xray?.subscriptionUrl ? 'موجود ✓' : '—'],
    ],
  });
};

export const purchaseSuccessTemplate = (result: ProvisionResultDto): string => {
  const sub = result.subscription;
  const configCount = sub?.configLinks.length ?? 0;
  return [
    successMessage('سرویس شما با موفقیت فعال شد!'),
    '',
    statusCard({
      title: `✨ ${result.service.product.name}`,
      body: 'خلاصه سرویس خریداری‌شده',
      rows: [
        ['پروتکل', result.service.product.protocol],
        ['حجم', `${result.service.trafficLimitGb} GB`],
        ['انقضا', formatPersianDate(result.service.expiresAt)],
        ['لینک اشتراک', sub?.subscriptionUrl ? 'آماده' : '—'],
        ['کانفیگ‌ها', `${configCount} لینک`],
      ],
    }),
    '',
    '📲 پیشنهاد اپ‌ها: v2rayNG · Streisand · Hiddify',
    'از دکمه‌های زیر لینک‌ها را کپی کنید یا QR دریافت کنید.',
  ].join('\n');
};

export const buyQuoteTemplate = (quote: {
  trafficGb: number;
  finalAmountToman: string;
  productName: string;
}): string =>
  statusCard({
    title: '🛒 تأیید خرید',
    body: `محصول: ${quote.productName}`,
    rows: [
      ['حجم انتخابی', `${quote.trafficGb} GB`],
      ['مبلغ نهایی', formatToman(Number(quote.finalAmountToman))],
    ],
  });

export const productPickerTemplate = (products: Array<{ name: string; protocol: string; trafficGb: number; priceToman: string }>): string => {
  const lines = products.map(
    (p, i) => `${i + 1}. ${p.name} — ${p.protocol} | ${p.trafficGb}GB | ${formatToman(Number(p.priceToman))}`,
  );
  return ['🛒 انتخاب محصول', '', ...lines, '', 'یک محصول را انتخاب کنید:'].join('\n');
};
