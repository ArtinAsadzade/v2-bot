import type { Telegraf } from "telegraf";
import type { AppContext } from "../../types/bot";
import { ForcedJoinService } from "../../modules/system/forced-join.service";
import { auditLog } from "../../services/audit-log";

const PREVIOUS_MEMBER_STATUSES = new Set(["member", "administrator", "creator"]);
const LEFT_STATUSES = new Set(["left", "kicked"]);

type ChatMemberUpdate = {
  chat: { id: number | string };
  old_chat_member: { status: string };
  new_chat_member: { status: string; user: { id: number; is_bot?: boolean } };
};

type TelegramLike = {
  sendMessage(chatId: number, text: string, options?: Record<string, unknown>): Promise<unknown>;
};

function isBlockedReminderDestination(destinationChatId: unknown, forcedJoinChannel: { chatId: string }) {
  if (destinationChatId === null || destinationChatId === undefined || destinationChatId === "") return true;
  if (typeof destinationChatId === "string" && destinationChatId.startsWith("-")) return true;

  const numericDestination = Number(destinationChatId);
  if (Number.isFinite(numericDestination) && numericDestination < 0) return true;
  if (String(destinationChatId) === String(forcedJoinChannel.chatId)) return true;

  return false;
}

async function sendForcedJoinLeaveReminderToUserOnly(input: {
  telegram: TelegramLike;
  destinationChatId: number;
  forcedJoinChannel: { chatId: string; title: string; inviteLink?: string | null };
  channelId: string;
  oldStatus: string;
  newStatus: string;
}) {
  const { telegram, destinationChatId, forcedJoinChannel, channelId, oldStatus, newStatus } = input;

  if (isBlockedReminderDestination(destinationChatId, forcedJoinChannel)) {
    auditLog({ area: "forced_join", action: "leave_reminder", status: "blocked", entityId: forcedJoinChannel.chatId, error: "FORCED_JOIN_CHANNEL_DESTINATION_BLOCKED", metadata: { severity: "CRITICAL", channelId, destinationChatId, oldStatus, newStatus } });
    return;
  }

  await telegram.sendMessage(Number(destinationChatId), `⚠️ عضویت شما در کانال «${forcedJoinChannel.title}» لغو شد.\n\nبرای ادامه استفاده از ربات، دوباره عضو کانال شوید.`);
  auditLog({ area: "forced_join", action: "leave_reminder", status: "sent", entityId: String(destinationChatId), metadata: { event: "FORCED_JOIN_REMINDER_SENT_TO_USER", channelId, destinationChatId, oldStatus, newStatus } });
}

export async function handleForcedJoinChatMemberUpdate(telegram: TelegramLike, update: ChatMemberUpdate) {
  const channelId = String(update.chat.id);
  const oldStatus = update.old_chat_member.status;
  const newStatus = update.new_chat_member.status;

  auditLog({ area: "forced_join", action: "chat_member_update", status: "received", entityId: channelId, metadata: { event: "FORCED_JOIN_LEAVE_EVENT_RECEIVED", channelId, oldStatus, newStatus } });

  const affectedUser = update.new_chat_member.user;
  const affectedUserTelegramId = affectedUser.id;

  auditLog({ area: "forced_join", action: "affected_user", status: "resolved", entityId: String(affectedUserTelegramId), metadata: { event: "FORCED_JOIN_AFFECTED_USER_RESOLVED", affectedUserTelegramId, channelId, oldStatus, newStatus } });

  if (affectedUser.is_bot === true) return;
  if (!PREVIOUS_MEMBER_STATUSES.has(oldStatus) || !LEFT_STATUSES.has(newStatus)) return;
  if (String(affectedUserTelegramId) === channelId) return;

  const channel = await ForcedJoinService.findActiveByChatId(channelId);
  if (!channel) return;

  const destinationChatId = affectedUserTelegramId;

  try {
    await sendForcedJoinLeaveReminderToUserOnly({ telegram, destinationChatId: affectedUserTelegramId, forcedJoinChannel: channel, channelId, oldStatus, newStatus });
  } catch (error) {
    auditLog({ area: "forced_join", action: "leave_reminder", status: "failed", entityId: String(destinationChatId), error, metadata: { event: "FORCED_JOIN_REMINDER_DM_FAILED", affectedUserTelegramId, channelId, destinationChatId, oldStatus, newStatus } });
  }
}

export function registerForcedJoinEvents(bot: Telegraf<AppContext>) {
  bot.on("chat_member", async (ctx) => {
    await handleForcedJoinChatMemberUpdate(ctx.telegram, ctx.update.chat_member as ChatMemberUpdate);
  });
}
