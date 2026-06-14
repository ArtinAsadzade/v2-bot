import type { AppBot } from "../../types/bot";
import { ForcedJoinService } from "../../modules/system/forced-join.service";
import { UserService } from "../../modules/user/user.service";
import { logger } from "../../services/logger";

const PREVIOUS_MEMBER_STATUSES = new Set(["member", "administrator", "creator"]);
const LEFT_STATUSES = new Set(["left", "kicked"]);

function joinUrl(channel: { inviteLink?: string | null; chatId: string }) {
  if (channel.inviteLink?.trim()) return channel.inviteLink.trim();
  if (channel.chatId.startsWith("@")) return `https://t.me/${channel.chatId.slice(1)}`;
  return "https://t.me/";
}

type ForcedJoinLeaveReminderChannel = {
  id: string;
  chatId: string;
  title: string;
  inviteLink?: string | null;
};

type ForcedJoinLeaveReminderLogContext = {
  affectedUserTelegramId: number | string | null | undefined;
  channelId: string;
  destinationChatId: number | string | null | undefined;
  oldStatus: string;
  newStatus: string;
};

function isPrivateUserDestination(destinationChatId: number | string | null | undefined) {
  if (destinationChatId === null || destinationChatId === undefined || destinationChatId === "") return false;
  if (typeof destinationChatId === "string" && destinationChatId.startsWith("-")) return false;
  const numericDestination = Number(destinationChatId);
  return Number.isSafeInteger(numericDestination) && numericDestination > 0;
}

function logBlockedChannelDestination(logContext: ForcedJoinLeaveReminderLogContext & { forcedJoinChannelChatId?: string; reason: string }) {
  const destination = logContext.destinationChatId;
  const numericDestination = Number(destination);
  const isCritical = (typeof destination === "string" && destination.startsWith("-")) || (Number.isFinite(numericDestination) && numericDestination < 0);
  logger.error("FORCED_JOIN_CHANNEL_DESTINATION_BLOCKED", { ...logContext, severity: isCritical ? "CRITICAL" : "ERROR" });
}

export async function sendForcedJoinLeaveReminderToUserOnly({
  telegram,
  affectedUserTelegramId,
  forcedJoinChannel,
  logContext,
}: {
  telegram: { sendMessage: AppBot["telegram"]["sendMessage"] };
  affectedUserTelegramId: number | string | null | undefined;
  forcedJoinChannel: ForcedJoinLeaveReminderChannel;
  logContext?: Partial<ForcedJoinLeaveReminderLogContext>;
}) {
  const destinationChatId = affectedUserTelegramId;
  const completeLogContext: ForcedJoinLeaveReminderLogContext = {
    affectedUserTelegramId,
    channelId: forcedJoinChannel.chatId,
    destinationChatId,
    oldStatus: logContext?.oldStatus ?? "unknown",
    newStatus: logContext?.newStatus ?? "unknown",
  };

  if (!isPrivateUserDestination(destinationChatId)) {
    logBlockedChannelDestination({ ...completeLogContext, forcedJoinChannelChatId: forcedJoinChannel.chatId, reason: "destination_is_not_private_user_id" });
    return false;
  }

  if (String(destinationChatId) === String(forcedJoinChannel.chatId)) {
    logBlockedChannelDestination({ ...completeLogContext, forcedJoinChannelChatId: forcedJoinChannel.chatId, reason: "destination_equals_forced_join_channel" });
    return false;
  }

  try {
    await telegram.sendMessage(Number(destinationChatId), `⚠️ عضویت شما در کانال الزامی قطع شد

شما از کانال زیر خارج شده‌اید:

📢 ${forcedJoinChannel.title}

برای استفاده کامل از ربات، لطفاً دوباره عضو شوید.`, {
      reply_markup: { inline_keyboard: [[{ text: "🔗 عضویت دوباره", url: joinUrl(forcedJoinChannel) }], [{ text: "✅ عضو شدم", callback_data: `forced_join:verify:${forcedJoinChannel.id}` }]] },
    });
    logger.info("FORCED_JOIN_REMINDER_SENT_TO_USER", completeLogContext);
    return true;
  } catch (error) {
    logger.warn("FORCED_JOIN_REMINDER_DM_FAILED", { ...completeLogContext, error: error instanceof Error ? error.message : String(error) });
    return false;
  }
}

export function registerForcedJoinEventHandlers(bot: AppBot) {
  bot.on("chat_member", async (ctx) => {
    const update = ctx.chatMember;
    const channelId = String(update.chat.id);
    const oldStatus = update.old_chat_member.status;
    const newStatus = update.new_chat_member.status;
    const affectedUser = update.new_chat_member.user;
    const affectedUserTelegramId = affectedUser.id;
    const eventLogContext = { affectedUserTelegramId, channelId, destinationChatId: affectedUserTelegramId, oldStatus, newStatus };

    logger.info("FORCED_JOIN_LEAVE_EVENT_RECEIVED", eventLogContext);
    logger.info("FORCED_JOIN_AFFECTED_USER_RESOLVED", eventLogContext);

    const channel = await ForcedJoinService.findActiveByChatId(channelId);
    if (!channel) return;
    if (affectedUser.is_bot === true) return;
    if (!PREVIOUS_MEMBER_STATUSES.has(oldStatus) || !LEFT_STATUSES.has(newStatus)) return;

    if (String(affectedUserTelegramId) === channelId || String(affectedUserTelegramId) === String(channel.chatId)) {
      logBlockedChannelDestination({ ...eventLogContext, forcedJoinChannelChatId: channel.chatId, reason: "destination_equals_update_or_forced_join_channel" });
      return;
    }

    const user = await UserService.getByTelegramId(affectedUserTelegramId);
    if (!user) return;
    if (!(await ForcedJoinService.canSendLeaveReminder(user.id, channel.id))) return;

    const sent = await sendForcedJoinLeaveReminderToUserOnly({ telegram: ctx.telegram, affectedUserTelegramId, forcedJoinChannel: channel, logContext: eventLogContext });
    if (!sent) return;
    await ForcedJoinService.recordLeaveReminder({ userId: user.id, channelId: channel.id, telegramId: user.telegramId, chatId: channel.chatId });
  });
}
