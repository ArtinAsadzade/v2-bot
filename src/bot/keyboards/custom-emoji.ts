import type { MessageEntity } from "telegraf/types";

export type CustomEmojiToken = { fallback: string; customEmojiId?: string };
export type CustomEmojiMessage = { text: string; entities?: MessageEntity[] };

export function customEmojiSupportEnabled() {
  return process.env.TELEGRAM_CUSTOM_EMOJI_ENABLED === "true";
}

export function customEmoji(fallback: string, customEmojiIdEnv: string): CustomEmojiToken {
  return { fallback, customEmojiId: process.env[customEmojiIdEnv] };
}

export function composeCustomEmojiMessage(parts: (string | CustomEmojiToken)[]): CustomEmojiMessage {
  let text = "";
  const entities: MessageEntity[] = [];
  for (const part of parts) {
    if (typeof part === "string") {
      text += part;
      continue;
    }
    const offset = text.length;
    text += part.fallback;
    if (customEmojiSupportEnabled() && part.customEmojiId) {
      entities.push({ type: "custom_emoji", offset, length: part.fallback.length, custom_emoji_id: part.customEmojiId });
    }
  }
  return entities.length > 0 ? { text, entities } : { text };
}
