"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerForcedJoinEventHandlers = registerForcedJoinEventHandlers;
const forced_join_service_1 = require("../../modules/system/forced-join.service");
const user_service_1 = require("../../modules/user/user.service");
const logger_1 = require("../../services/logger");
const PREVIOUS_MEMBER_STATUSES = new Set(["member", "administrator", "creator"]);
const LEFT_STATUSES = new Set(["left", "kicked"]);
function joinUrl(channel) {
    if (channel.inviteLink?.trim())
        return channel.inviteLink.trim();
    if (channel.chatId.startsWith("@"))
        return `https://t.me/${channel.chatId.slice(1)}`;
    return "https://t.me/";
}
function registerForcedJoinEventHandlers(bot) {
    bot.on("chat_member", async (ctx) => {
        const update = ctx.chatMember;
        const chatId = String(update.chat.id);
        const oldStatus = update.old_chat_member.status;
        const newStatus = update.new_chat_member.status;
        const affectedUser = update.new_chat_member.user;
        const channel = await forced_join_service_1.ForcedJoinService.findActiveByChatId(chatId);
        if (!channel)
            return;
        if (affectedUser.is_bot)
            return;
        if (!PREVIOUS_MEMBER_STATUSES.has(oldStatus) || !LEFT_STATUSES.has(newStatus))
            return;
        const logContext = {
            affectedUserTelegramId: String(affectedUser.id),
            channelId: channel.id,
            channelTitle: channel.title,
            oldStatus,
            newStatus,
        };
        logger_1.logger.info("FORCED_JOIN_MEMBER_LEFT", logContext);
        const user = await user_service_1.UserService.getByTelegramId(affectedUser.id);
        if (!user)
            return;
        if (!(await forced_join_service_1.ForcedJoinService.canSendLeaveReminder(user.id, channel.id))) {
            logger_1.logger.info("FORCED_JOIN_REMINDER_SKIPPED_COOLDOWN", logContext);
            return;
        }
        try {
            await ctx.telegram.sendMessage(affectedUser.id, `⚠️ عضویت شما در کانال الزامی قطع شد

شما از کانال زیر خارج شده‌اید:

📢 ${channel.title}

برای استفاده کامل از ربات، لطفاً دوباره عضو شوید.`, {
                reply_markup: { inline_keyboard: [[{ text: "🔗 عضویت دوباره", url: joinUrl(channel) }], [{ text: "✅ عضو شدم", callback_data: `forced_join:verify:${channel.id}` }]] },
            });
            await forced_join_service_1.ForcedJoinService.recordLeaveReminder({ userId: user.id, channelId: channel.id, telegramId: user.telegramId, chatId: channel.chatId });
            logger_1.logger.info("FORCED_JOIN_REMINDER_SENT", logContext);
        }
        catch (error) {
            logger_1.logger.warn("FORCED_JOIN_REMINDER_DM_FAILED", { ...logContext, error: error instanceof Error ? error.message : String(error) });
        }
    });
}
