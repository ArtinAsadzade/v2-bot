import type { AppBot } from "../../types/bot";
import { ForcedJoinService } from "../../modules/system/forced-join.service";
import { UserService } from "../../modules/user/user.service";
import { logger } from "../../services/logger";

const LEFT_STATUSES = new Set(["left", "kicked"]);
function joinUrl(channel: { inviteLink?: string | null; chatId: string }) {
  if (channel.inviteLink?.trim()) return channel.inviteLink.trim();
  if (channel.chatId.startsWith("@")) return `https://t.me/${channel.chatId.slice(1)}`;
  return "https://t.me/";
}

export function registerForcedJoinEventHandlers(bot: AppBot) {
  bot.on("chat_member", async (ctx) => {
    const update = ctx.chatMember;
    const newStatus = update.new_chat_member.status;
    if (!LEFT_STATUSES.has(newStatus)) return;
    const channel = await ForcedJoinService.findActiveByChatId(String(update.chat.id));
    if (!channel) return;
    const tgUser = update.new_chat_member.user;
    if (tgUser.is_bot) return;
    const user = await UserService.getByTelegramId(tgUser.id);
    if (!user) return;
    if (!(await ForcedJoinService.canSendLeaveReminder(user.id, channel.id))) return;
    try {
      await ctx.telegram.sendMessage(Number(user.telegramId), `⚠️ عضویت شما در کانال الزامی قطع شد\n\nشما از کانال زیر خارج شده‌اید:\n\n📢 ${channel.title}\n\nبرای استفاده کامل از ربات، لطفاً دوباره عضو شوید.\nتا زمان عضویت دوباره، دسترسی برخی بخش‌ها محدود می‌شود.`, {
        reply_markup: { inline_keyboard: [[{ text: "🔗 عضویت دوباره", url: joinUrl(channel) }], [{ text: "✅ عضو شدم", callback_data: "forced_join:verify" }]] },
      });
      await ForcedJoinService.recordLeaveReminder({ userId: user.id, channelId: channel.id, telegramId: user.telegramId, chatId: channel.chatId });
    } catch (error) {
      logger.info("Forced join leave reminder could not be delivered", { telegramId: user.telegramId, channelId: channel.id, error: error instanceof Error ? error.message : String(error) });
    }
  });
}
