"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendForcedJoinLeaveReminder = sendForcedJoinLeaveReminder;
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
function isChannelLikeTelegramId(telegramId) {
    return telegramId < 0 || String(telegramId).startsWith("-100");
}
async function sendForcedJoinLeaveReminder({ telegram, affectedUserId, channel, logContext, }) {
    if (!affectedUserId || String(affectedUserId) === String(channel.chatId) || isChannelLikeTelegramId(affectedUserId)) {
        logger_1.logger.warn("FORCED_JOIN_REMINDER_BLOCKED_CHANNEL_DESTINATION", logContext);
        return false;
    }
    await telegram.sendMessage(affectedUserId, `⚠️ عضویت شما در کانال الزامی قطع شد

شما از کانال زیر خارج شده‌اید:

📢 ${channel.title}

برای استفاده کامل از ربات، لطفاً دوباره عضو شوید.`, {
        reply_markup: { inline_keyboard: [[{ text: "🔗 عضویت دوباره", url: joinUrl(channel) }], [{ text: "✅ عضو شدم", callback_data: `forced_join:verify:${channel.id}` }]] },
    });
    return true;
}
function registerForcedJoinEventHandlers(bot) {
    bot.on("chat_member", async (ctx) => {
        const update = ctx.chatMember;
        const channelChatId = String(update.chat.id);
        const oldStatus = update.old_chat_member.status;
        const newStatus = update.new_chat_member.status;
        const affectedUser = update.new_chat_member.user;
        const channel = await forced_join_service_1.ForcedJoinService.findActiveByChatId(channelChatId);
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
        logger_1.logger.info("FORCED_JOIN_LEAVE_DETECTED", logContext);
        const user = await user_service_1.UserService.getByTelegramId(affectedUser.id);
        if (!user)
            return;
        if (!(await forced_join_service_1.ForcedJoinService.canSendLeaveReminder(user.id, channel.id))) {
            logger_1.logger.info("FORCED_JOIN_REMINDER_SKIPPED_COOLDOWN", logContext);
            return;
        }
        try {
            const sent = await sendForcedJoinLeaveReminder({ telegram: ctx.telegram, affectedUserId: affectedUser.id, channel, logContext });
            if (!sent)
                return;
            await forced_join_service_1.ForcedJoinService.recordLeaveReminder({ userId: user.id, channelId: channel.id, telegramId: user.telegramId, chatId: channel.chatId });
            logger_1.logger.info("FORCED_JOIN_REMINDER_SENT_DM", logContext);
        }
        catch (error) {
            const errorContext = { ...logContext, error: error instanceof Error ? error.message : String(error) };
            logger_1.logger.warn("FORCED_JOIN_REMINDER_DM_FAILED", errorContext);
            logger_1.logger.warn("FORCED_JOIN_REMINDER_SKIPPED_DM_FAILED", errorContext);
        }
    });
}
