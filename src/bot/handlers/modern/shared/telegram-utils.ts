import type { AppContext } from "../../../../types/bot";
import { answerCallback as safeAnswerCallback } from "../../../callback-ack";

export function getTelegramUserId(ctx: AppContext) {
  return ctx.from?.id;
}

export function getChatId(ctx: AppContext) {
  return ctx.chat?.id;
}

export async function answerCallback(ctx: AppContext, text?: string) {
  await safeAnswerCallback(ctx, text);
}
