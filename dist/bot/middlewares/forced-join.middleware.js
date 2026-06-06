"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.forcedJoinMiddleware = forcedJoinMiddleware;
const telegraf_1 = require("telegraf");
const forced_join_service_1 = require("../../modules/system/forced-join.service");
const MEMBER_STATUSES = new Set(["creator", "administrator", "member"]);
function forcedJoinMiddleware() {
    return async (ctx, next) => {
        if (!ctx.from)
            return next();
        const channels = await forced_join_service_1.ForcedJoinService.listActive();
        if (!channels.length)
            return next();
        const missing = [];
        for (const channel of channels) {
            try {
                const member = await ctx.telegram.getChatMember(channel.chatId, ctx.from.id);
                if (!MEMBER_STATUSES.has(member.status))
                    missing.push(channel);
            }
            catch {
                missing.push(channel);
            }
        }
        if (!missing.length)
            return next();
        if ("callback_query" in ctx.update)
            await ctx.answerCbQuery("ابتدا عضو کانال‌های اعلام‌شده شوید").catch(() => undefined);
        await ctx.reply(`📢 برای استفاده از ربات ابتدا عضو کانال‌های زیر شوید و سپس دوباره /start را ارسال کنید.`, telegraf_1.Markup.inlineKeyboard(missing.map((channel) => [telegraf_1.Markup.button.url(`عضویت در ${channel.title}`, channel.inviteLink || `https://t.me/${String(channel.chatId).replace(/^@/, "")}`)]))).catch(() => undefined);
        return;
    };
}
