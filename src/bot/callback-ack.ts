import type { AppContext } from "../types/bot";

const ACK_STATE = Symbol("callbackAckState");
const RAW_ANSWER = Symbol("rawAnswerCbQuery");
type AckState = { answered?: boolean };
type AnswerCbQuery = NonNullable<AppContext["answerCbQuery"]>;

function stateFor(ctx: AppContext): AckState {
  const target = ctx as AppContext & { [ACK_STATE]?: AckState };
  target[ACK_STATE] ??= {};
  return target[ACK_STATE];
}

export async function answerCallback(ctx: AppContext, text?: string, extra?: Parameters<AnswerCbQuery>[1]) {
  if (!ctx.callbackQuery || typeof ctx.answerCbQuery !== "function") return false;
  const state = stateFor(ctx);
  if (state.answered) return false;
  state.answered = true;
  const raw = (ctx as AppContext & { [RAW_ANSWER]?: AnswerCbQuery })[RAW_ANSWER]?.bind(ctx) ?? ctx.answerCbQuery.bind(ctx);
  try {
    await raw(text, extra);
    return true;
  } catch {
    return false;
  }
}

export async function acknowledgeCallbackImmediately(ctx: AppContext) {
  return answerCallback(ctx);
}

export function installCallbackAckGuard(ctx: AppContext) {
  if (!ctx.callbackQuery || typeof ctx.answerCbQuery !== "function") return;
  const target = ctx as AppContext & { [RAW_ANSWER]?: AnswerCbQuery };
  if (target[RAW_ANSWER]) return;
  const current = ctx.answerCbQuery.bind(ctx) as AnswerCbQuery;
  target[RAW_ANSWER] = current;
  ctx.answerCbQuery = (async (text?: string, extra?: Parameters<AnswerCbQuery>[1]) => {
    const state = stateFor(ctx);
    if (state.answered) return true;
    state.answered = true;
    try {
      return await current(text, extra);
    } catch {
      return true;
    }
  }) as AppContext["answerCbQuery"];
}
