import { randomBytes } from "node:crypto";
import type { AppContext, CallbackTokenEntry, CallbackTokenPayload, CallbackTokenType } from "../../types/bot";
import { ensureCallbackData } from "./panel-ui";

const CALLBACK_TOKEN_TTL_MS = 30 * 60 * 1000;
const MAX_CALLBACK_TOKENS = 80;

function now() {
  return Date.now();
}

export function pruneCallbackTokens(ctx: AppContext): void {
  const tokens = ctx.session.callbackTokens;
  if (!tokens) return;
  const cutoff = now() - CALLBACK_TOKEN_TTL_MS;
  for (const [token, entry] of Object.entries(tokens)) {
    if (!entry || entry.createdAt < cutoff) delete tokens[token];
  }
  const entries = Object.entries(tokens).sort(([, a], [, b]) => b.createdAt - a.createdAt);
  for (const [token] of entries.slice(MAX_CALLBACK_TOKENS)) delete tokens[token];
}

export function createCallbackToken<T extends CallbackTokenType>(ctx: AppContext, type: T, payload: CallbackTokenPayload<T>): string {
  pruneCallbackTokens(ctx);
  ctx.session.callbackTokens ??= {};
  let token = randomBytes(6).toString("base64url");
  while (ctx.session.callbackTokens[token]) token = randomBytes(6).toString("base64url");
  ctx.session.callbackTokens[token] = { type, payload, createdAt: now() } as CallbackTokenEntry;
  return token;
}

export function resolveCallbackToken<T extends CallbackTokenType>(ctx: AppContext, type: T, token: string): CallbackTokenPayload<T> | null {
  pruneCallbackTokens(ctx);
  const entry = ctx.session.callbackTokens?.[token];
  if (!entry || entry.type !== type) return null;
  return entry.payload as CallbackTokenPayload<T>;
}

export function deleteCallbackToken(ctx: AppContext, token: string): void {
  if (ctx.session.callbackTokens) delete ctx.session.callbackTokens[token];
}

export function tokenAction(prefix: string, token: string): string {
  return ensureCallbackData(`${prefix}:${token}`);
}
