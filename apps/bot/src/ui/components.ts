import { keyboard } from '../keyboards/inline-keyboard.js';

import type { InlineKeyboardMarkup } from 'telegraf/types';

export type Card = { title: string; body?: string; rows?: Array<[string, string | number]> };

export const statusCard = ({ title, body, rows = [] }: Card): string => {
  const details = rows.map(([label, value]) => `• ${label}: ${value}`).join('\n');
  return [title, body, details].filter(Boolean).join('\n\n');
};

export const emptyState = (title: string, body: string): string => `🫧 ${title}\n\n${body}`;

export const errorState = (body: string): string => `⚠️ ${body}`;

export const successMessage = (body: string): string => `✅ ${body}`;

export const loadingMessage = (body = 'در حال آماده‌سازی...'): string => `⏳ ${body}`;

export const confirmationDialog = (text: string, yesAction: string, noAction = 'back'): { text: string; reply_markup: InlineKeyboardMarkup } => ({
  text,
  reply_markup: keyboard()
    .row(keyboard().button('تأیید', 'confirm', yesAction), keyboard().button('انصراف', 'nav', noAction))
    .build(),
});

export const clipboardButton = (label: string, value: string): InlineKeyboardMarkup => keyboard().row(keyboard().url(label, value)).build();

export const toggleButton = (label: string, enabled: boolean, key: string): InlineKeyboardMarkup =>
  keyboard().row(keyboard().button(`${enabled ? '✅' : '◻️'} ${label}`, 'toggle', key, enabled ? '0' : '1')).build();

export const paginatedListKeyboard = (page: number, hasNext: boolean, target: string): InlineKeyboardMarkup => {
  const builder = keyboard();
  const controls = [];
  if (page > 1) controls.push(builder.button('قبلی', 'nav', target, String(page - 1)));
  if (hasNext) controls.push(builder.button('بعدی', 'nav', target, String(page + 1)));
  if (controls.length) builder.row(...controls);
  return builder.build();
};
