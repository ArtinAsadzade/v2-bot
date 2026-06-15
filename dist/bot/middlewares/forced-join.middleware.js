"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.forcedJoinMiddleware = forcedJoinMiddleware;
const telegraf_1 = require("telegraf");
const forced_join_service_1 = require("../../modules/system/forced-join.service");
const MEMBER_STATUSES = new Set(["creator", "administrator", "member"]);
const VERIFY_ACTION = "forced_join:verify";
function fallbackJoinUrl(chatId) {
    const normalized = chatId.trim();
    if (!normalized)
        return undefined;
    if (normalized.startsWith("http://") || normalized.startsWith("https://"))
        return normalized;
    if (normalized.startsWith("@"))
        return `https://t.me/${normalized.slice(1)}`;
    return undefined;
}
function joinUrl(channel) {
    return channel.inviteLink?.trim() || fallbackJoinUrl(channel.chatId);
}
async function isMember(ctx, channel) {
    if (!ctx.from)
        return false;
    try {
        const member = await ctx.telegram.getChatMember(channel.chatId, ctx.from.id);
        return MEMBER_STATUSES.has(member.status);
    }
    catch {
        return false;
    }
}
async function missingRequiredChannels(ctx, channels) {
    if (!ctx.from || !channels.length)
        return [];
    const checks = await Promise.all(channels.map(async (channel) => ({ channel, member: await isMember(ctx, channel) })));
    return checks
        .filter(({ member }) => !member)
        .map(({ channel }) => ({ ...channel, joinUrl: joinUrl(channel) ?? "https://t.me/" }));
}
function forcedJoinText(missingCount, totalCount) {
    const progress = totalCount > missingCount ? `\n\n✅ عضویت تاییدشده: ${(totalCount - missingCount).toLocaleString("fa-IR")} از ${totalCount.toLocaleString("fa-IR")}` : "";
    return [
        "📢 عضویت در کانال‌های الزامی",
        "",
        `برای استفاده از ربات، عضویت در ${missingCount.toLocaleString("fa-IR")} کانال زیر لازم است.${progress}`,
        "",
        "۱) روی دکمه‌های عضویت بزنید.",
        "۲) بعد از عضویت، همین‌جا روی «✅ عضو شدم» بزنید.",
        "",
        "نیازی به ارسال دوباره /start نیست؛ تایید بلافاصله انجام می‌شود.",
    ].join("\n");
}
function forcedJoinKeyboard(channels) {
    const joinRows = channels.map((channel, index) => [
        telegraf_1.Markup.button.url(`📢 عضویت ${index + 1}: ${channel.title}`, channel.joinUrl),
    ]);
    return telegraf_1.Markup.inlineKeyboard([
        ...joinRows,
        [telegraf_1.Markup.button.callback("✅ عضو شدم", VERIFY_ACTION)],
    ]);
}
async function showForcedJoinPrompt(ctx, missing, totalCount, prefix) {
    const text = [prefix, forcedJoinText(missing.length, totalCount)].filter(Boolean).join("\n\n");
    const keyboard = forcedJoinKeyboard(missing);
    if (ctx.callbackQuery?.message && "text" in ctx.callbackQuery.message) {
        await ctx.editMessageText(text, keyboard).catch(async () => {
            await ctx.reply(text, keyboard).catch(() => undefined);
        });
        return;
    }
    await ctx.reply(text, keyboard).catch(() => undefined);
}
function forcedJoinMiddleware() {
    return async (ctx, next) => {
        if (!ctx.from)
            return next();
        const activeChannels = await forced_join_service_1.ForcedJoinService.listActive();
        if (!activeChannels.length)
            return next();
        const missing = await missingRequiredChannels(ctx, activeChannels);
        if (!missing.length)
            return next();
        const isVerification = ctx.callbackQuery && "data" in ctx.callbackQuery && ctx.callbackQuery.data.startsWith(VERIFY_ACTION);
        if (isVerification) {
            await ctx.answerCbQuery("⚠️ هنوز عضویت شما در همه کانال‌ها تایید نشده است.", { show_alert: true }).catch(() => undefined);
            await showForcedJoinPrompt(ctx, missing, activeChannels.length, "⚠️ هنوز چند کانال باقی مانده است.");
            return;
        }
        if ("callback_query" in ctx.update) {
            await ctx.answerCbQuery("ابتدا عضویت در کانال‌ها را تکمیل کنید.").catch(() => undefined);
        }
        await showForcedJoinPrompt(ctx, missing, activeChannels.length);
    };
}
