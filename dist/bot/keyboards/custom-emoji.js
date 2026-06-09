"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.customEmojiSupportEnabled = customEmojiSupportEnabled;
exports.customEmoji = customEmoji;
exports.composeCustomEmojiMessage = composeCustomEmojiMessage;
function customEmojiSupportEnabled() {
    return process.env.TELEGRAM_CUSTOM_EMOJI_ENABLED === "true";
}
function customEmoji(fallback, customEmojiIdEnv) {
    return { fallback, customEmojiId: process.env[customEmojiIdEnv] };
}
function composeCustomEmojiMessage(parts) {
    let text = "";
    const entities = [];
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
