"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleForcedJoinChatMemberUpdate = handleForcedJoinChatMemberUpdate;
exports.registerForcedJoinEvents = registerForcedJoinEvents;
const forced_join_service_1 = require("../../modules/system/forced-join.service");
const audit_log_1 = require("../../services/audit-log");
const PREVIOUS_MEMBER_STATUSES = new Set(["member", "administrator", "creator"]);
const LEFT_STATUSES = new Set(["left", "kicked"]);
function isBlockedReminderDestination(destinationChatId, forcedJoinChannel) {
    if (destinationChatId === null || destinationChatId === undefined || destinationChatId === "")
        return true;
    if (typeof destinationChatId === "string" && destinationChatId.startsWith("-"))
        return true;
    const numericDestination = Number(destinationChatId);
    if (Number.isFinite(numericDestination) && numericDestination < 0)
        return true;
    if (String(destinationChatId) === String(forcedJoinChannel.chatId))
        return true;
    return false;
}
async function sendForcedJoinLeaveReminderToUserOnly(input) {
    const { telegram, destinationChatId, forcedJoinChannel, channelId, oldStatus, newStatus } = input;
    if (isBlockedReminderDestination(destinationChatId, forcedJoinChannel)) {
        (0, audit_log_1.auditLog)({ area: "forced_join", action: "leave_reminder", status: "blocked", entityId: forcedJoinChannel.chatId, error: "FORCED_JOIN_CHANNEL_DESTINATION_BLOCKED", metadata: { severity: "CRITICAL", channelId, destinationChatId, oldStatus, newStatus } });
        return;
    }
    await telegram.sendMessage(Number(destinationChatId), `⚠️ عضویت شما در کانال «${forcedJoinChannel.title}» لغو شد.\n\nبرای ادامه استفاده از ربات، دوباره عضو کانال شوید.`);
    (0, audit_log_1.auditLog)({ area: "forced_join", action: "leave_reminder", status: "sent", entityId: String(destinationChatId), metadata: { event: "FORCED_JOIN_REMINDER_SENT_TO_USER", channelId, destinationChatId, oldStatus, newStatus } });
}
async function handleForcedJoinChatMemberUpdate(telegram, update) {
    const channelId = String(update.chat.id);
    const oldStatus = update.old_chat_member.status;
    const newStatus = update.new_chat_member.status;
    (0, audit_log_1.auditLog)({ area: "forced_join", action: "chat_member_update", status: "received", entityId: channelId, metadata: { event: "FORCED_JOIN_LEAVE_EVENT_RECEIVED", channelId, oldStatus, newStatus } });
    const affectedUser = update.new_chat_member.user;
    const affectedUserTelegramId = affectedUser.id;
    (0, audit_log_1.auditLog)({ area: "forced_join", action: "affected_user", status: "resolved", entityId: String(affectedUserTelegramId), metadata: { event: "FORCED_JOIN_AFFECTED_USER_RESOLVED", affectedUserTelegramId, channelId, oldStatus, newStatus } });
    if (affectedUser.is_bot === true)
        return;
    if (!PREVIOUS_MEMBER_STATUSES.has(oldStatus) || !LEFT_STATUSES.has(newStatus))
        return;
    if (String(affectedUserTelegramId) === channelId)
        return;
    const channel = await forced_join_service_1.ForcedJoinService.findActiveByChatId(channelId);
    if (!channel)
        return;
    const destinationChatId = affectedUserTelegramId;
    try {
        await sendForcedJoinLeaveReminderToUserOnly({ telegram, destinationChatId: affectedUserTelegramId, forcedJoinChannel: channel, channelId, oldStatus, newStatus });
    }
    catch (error) {
        (0, audit_log_1.auditLog)({ area: "forced_join", action: "leave_reminder", status: "failed", entityId: String(destinationChatId), error, metadata: { event: "FORCED_JOIN_REMINDER_DM_FAILED", affectedUserTelegramId, channelId, destinationChatId, oldStatus, newStatus } });
    }
}
function registerForcedJoinEvents(bot) {
    bot.on("chat_member", async (ctx) => {
        await handleForcedJoinChatMemberUpdate(ctx.telegram, ctx.update.chat_member);
    });
}
