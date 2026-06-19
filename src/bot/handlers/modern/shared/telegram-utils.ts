import type { AppContext } from "../../../../types/bot";

export function getTelegramUserId(ctx: AppContext) {
  return ctx.from?.id;
}

export function getChatId(ctx: AppContext) {
  return ctx.chat?.id;
}

export async function answerCallback(ctx: AppContext, text?: string) {
  await ctx.answerCbQuery(text).catch(() => undefined);
}
