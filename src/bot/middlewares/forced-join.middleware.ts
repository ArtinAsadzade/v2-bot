import { Markup } from "telegraf";
import type { MiddlewareFn } from "telegraf";
import type { AppContext } from "../../types/bot";
import { ForcedJoinService } from "../../modules/system/forced-join.service";

const MEMBER_STATUSES = new Set(["creator", "administrator", "member"]);

async function missingRequiredChannels(ctx: AppContext) {
  const channels = await ForcedJoinService.listActive();
  const missing: typeof channels = [];
  if (!ctx.from) return missing;

  for (const channel of channels) {
    try {
      const member = await ctx.telegram.getChatMember(channel.chatId, ctx.from.id);
      if (!MEMBER_STATUSES.has(member.status)) missing.push(channel);
    } catch {
      missing.push(channel);
    }
  }

  return missing;
}

function forcedJoinKeyboard(channels: Awaited<ReturnType<typeof ForcedJoinService.listActive>>) {
  return Markup.inlineKeyboard([
    ...channels.map((channel) => [Markup.button.url(`📢 عضویت در کانال ${channel.title}`, channel.inviteLink || `https://t.me/${String(channel.chatId).replace(/^@/, "")}`)]),
    [Markup.button.callback("✅ عضو شدم", "forced_join:verify")],
  ]);
}

export function forcedJoinMiddleware(): MiddlewareFn<AppContext> {
  return async (ctx, next) => {
    if (!ctx.from) return next();
    const missing = await missingRequiredChannels(ctx);
    if (!missing.length) return next();

    const text = `📢 عضویت در کانال‌های الزامی\n\nبرای استفاده از ربات، ابتدا در کانال‌های زیر عضو شوید.\n\nبعد از عضویت، همین‌جا روی دکمه «✅ عضو شدم» بزنید؛ نیازی به ارسال دوباره /start نیست.`;
    const keyboard = forcedJoinKeyboard(missing);

    if (ctx.callbackQuery && "data" in ctx.callbackQuery && ctx.callbackQuery.data === "forced_join:verify") {
      await ctx.answerCbQuery("⚠️ هنوز در تمام کانال‌های الزامی عضو نشده‌اید.", { show_alert: true }).catch(() => undefined);
      if (ctx.callbackQuery.message && "text" in ctx.callbackQuery.message) {
        await ctx.editMessageText(`⚠️ هنوز در تمام کانال‌های الزامی عضو نشده‌اید.\n\n${text}`, keyboard).catch(() => undefined);
      }
      return;
    }

    if ("callback_query" in ctx.update) await ctx.answerCbQuery("ابتدا عضویت را تکمیل کنید").catch(() => undefined);
    if (ctx.callbackQuery?.message && "text" in ctx.callbackQuery.message) {
      await ctx.editMessageText(text, keyboard).catch(async () => ctx.reply(text, keyboard).catch(() => undefined));
      return;
    }
    await ctx.reply(text, keyboard).catch(() => undefined);
    return;
  };
}
