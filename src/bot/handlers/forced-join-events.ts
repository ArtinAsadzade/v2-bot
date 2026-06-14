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

function isChannelLikeTelegramId(telegramId: number) {
  return telegramId < 0 || String(telegramId).startsWith("-100");
}

type ForcedJoinLeaveReminderChannel = {
  id: string;
  chatId: string;
  title: string;
  inviteLink?: string | null;
};

type ForcedJoinLeaveReminderLogContext = {
  affectedUserTelegramId: string;
  channelId: string;
  channelTitle: string;
  oldStatus: string;
  newStatus: string;
};

export async function sendForcedJoinLeaveReminder({
  telegram,
  affectedUserId,
  channel,
  logContext,
}: {
  telegram: { sendMessage: AppBot["telegram"]["sendMessage"] };
  affectedUserId: number | undefined | null;
  channel: ForcedJoinLeaveReminderChannel;
  logContext: ForcedJoinLeaveReminderLogContext;
}) {
  if (!affectedUserId || String(affectedUserId) === String(channel.chatId) || isChannelLikeTelegramId(affectedUserId)) {
    logger.warn("FORCED_JOIN_REMINDER_BLOCKED_CHANNEL_DESTINATION", logContext);
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

export function registerForcedJoinEventHandlers(bot: AppBot) {
  bot.on("chat_member", async (ctx) => {
    const update = ctx.chatMember;
    const channelChatId = String(update.chat.id);
    const oldStatus = update.old_chat_member.status;
    const newStatus = update.new_chat_member.status;
    const affectedUser = update.new_chat_member.user;

    const channel = await ForcedJoinService.findActiveByChatId(channelChatId);
    if (!channel) return;
    if (affectedUser.is_bot) return;
    if (!PREVIOUS_MEMBER_STATUSES.has(oldStatus) || !LEFT_STATUSES.has(newStatus)) return;

    const logContext = {
      affectedUserTelegramId: String(affectedUser.id),
      channelId: channel.id,
      channelTitle: channel.title,
      oldStatus,
      newStatus,
    };

    logger.info("FORCED_JOIN_LEAVE_DETECTED", logContext);

    const user = await UserService.getByTelegramId(affectedUser.id);
    if (!user) return;
    if (!(await ForcedJoinService.canSendLeaveReminder(user.id, channel.id))) {
      logger.info("FORCED_JOIN_REMINDER_SKIPPED_COOLDOWN", logContext);
      return;
    }

    try {
      const sent = await sendForcedJoinLeaveReminder({ telegram: ctx.telegram, affectedUserId: affectedUser.id, channel, logContext });
      if (!sent) return;
      await ForcedJoinService.recordLeaveReminder({ userId: user.id, channelId: channel.id, telegramId: user.telegramId, chatId: channel.chatId });
      logger.info("FORCED_JOIN_REMINDER_SENT_DM", logContext);
    } catch (error) {
      const errorContext = { ...logContext, error: error instanceof Error ? error.message : String(error) };
      logger.warn("FORCED_JOIN_REMINDER_DM_FAILED", errorContext);
      logger.warn("FORCED_JOIN_REMINDER_SKIPPED_DM_FAILED", errorContext);
    }
  });
}
