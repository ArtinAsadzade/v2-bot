export type KeyboardLikeButton = { text: string; action?: string; url?: string };

function canonicalText(text: string): string {
  return text.replace(/^[\p{Emoji_Presentation}\p{Extended_Pictographic}\uFE0F\s]+/u, "").trim().replace(/\s+/g, " ");
}

function dedupeKey(button: KeyboardLikeButton): string {
  if (button.url) return `url:${button.url}`;
  if (button.action) return `action:${button.action}`;
  return `text:${canonicalText(button.text)}`;
}

export function normalizeKeyboardRows<T extends KeyboardLikeButton>(rows: T[][]): T[][] {
  const seen = new Set<string>();
  return rows
    .map((row) =>
      row
        .filter((button) => {
          const key = dedupeKey(button);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        }),
    )
    .filter((row) => row.length > 0) as T[][];
}
