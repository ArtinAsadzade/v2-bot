const markdownV2Chars = /[_*\[\]()~`>#+\-=|{}.!]/gu;

export const escapeMarkdown = (value: unknown): string => String(value ?? '').replace(markdownV2Chars, '\\$&');

export const bold = (value: unknown): string => `*${escapeMarkdown(value)}*`;

export const code = (value: unknown): string => `\`${escapeMarkdown(value)}\``;
