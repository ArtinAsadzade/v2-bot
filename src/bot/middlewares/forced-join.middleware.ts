import { Markup } from "telegraf";
import type { MiddlewareFn } from "telegraf";
import type { InlineKeyboardButton } from "telegraf/types";
import type { AppContext } from "../../types/bot";
import { ForcedJoinService } from "../../modules/system/forced-join.service";

const MEMBER_STATUSES = new Set(["creator", "administrator", "member"]);
const VERIFY_ACTION = "forced_join:verify";

type ActiveForcedJoinChannel = Awaited<ReturnType<typeof ForcedJoinService.listActive>>[number];
type MissingChannel = ActiveForcedJoinChannel & { joinUrl: string };

function fallbackJoinUrl(chatId: string): string | undefined {
  const normalized = chatId.trim();
  if (!normalized) return undefined;
  if (normalized.startsWith("http://") || normalized.startsWith("https://")) return normalized;
  if (normalized.startsWith("@")) return `https://t.me/${normalized.slice(1)}`;
  return undefined;
}

function joinUrl(channel: ActiveForcedJoinChannel): string | undefined {
  return channel.inviteLink?.trim() || fallbackJoinUrl(channel.chatId);
}

async function isMember(ctx: AppContext, channel: ActiveForcedJoinChannel) {
  if (!ctx.from) return false;

  try {
    const member = await ctx.telegram.getChatMember(channel.chatId, ctx.from.id);
    return MEMBER_STATUSES.has(member.status);
  } catch {
    return false;
  }
}

async function missingRequiredChannels(ctx: AppContext, channels: ActiveForcedJoinChannel[]): Promise<MissingChannel[]> {
  if (!ctx.from || !channels.length) return [];

  const checks = await Promise.all(
    channels.map(async (channel) => ({ channel, member: await isMember(ctx, channel) })),
  );

  return checks
    .filter(({ member }) => !member)
    .map(({ channel }) => ({ ...channel, joinUrl: joinUrl(channel) ?? "https://t.me/" }));
}

function forcedJoinText(missingCount: number, totalCount: number) {
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

function forcedJoinKeyboard(channels: MissingChannel[]) {
  const joinRows: InlineKeyboardButton[][] = channels.map((channel, index) => [
    Markup.button.url(`📢 عضویت ${index + 1}: ${channel.title}`, channel.joinUrl),
  ]);

  return Markup.inlineKeyboard([
    ...joinRows,
    [Markup.button.callback("✅ عضو شدم", VERIFY_ACTION)],
  ]);
}

async function showForcedJoinPrompt(ctx: AppContext, missing: MissingChannel[], totalCount: number, prefix?: string) {
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

export function forcedJoinMiddleware(): MiddlewareFn<AppContext> {
  return async (ctx, next) => {
    if (!ctx.from) return next();

    const activeChannels = await ForcedJoinService.listActive();
    if (!activeChannels.length) return next();

    const missing = await missingRequiredChannels(ctx, activeChannels);
    if (!missing.length) return next();

    const isVerification = ctx.callbackQuery && "data" in ctx.callbackQuery && ctx.callbackQuery.data === VERIFY_ACTION;

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
