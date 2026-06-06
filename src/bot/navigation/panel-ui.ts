import { Markup } from "telegraf";
import type { InlineKeyboardButton } from "telegraf/types";
import type { AppContext } from "../../types/bot";

export type UiButton = { text: string; action: string };
export type UiKeyboard = UiButton[][];
export type PanelViewId =
  | "home"
  | "shop.categories"
  | "shop.products"
  | "shop.product"
  | "shop.checkout"
  | "shop.searchResults"
  | "wallet"
  | "account"
  | "account.details"
  | "account.history"
  | "wallet.history"
  | "deposit"
  | "support"
  | "referral"
  | "freeAccount"
  | "admin.dashboard"
  | "admin.users"
  | "admin.user"
  | "admin.user.blocks"
  | "admin.products"
  | "admin.product"
  | "admin.accounts"
  | "admin.freeAccounts"
  | "admin.coupons"
  | "admin.crypto"
  | "admin.store"
  | "admin.referrals"
  | "admin.analytics"
  | "admin.deposits"
  | "admin.deposit"
  | "admin.orders"
  | "admin.tickets"
  | "admin.ticket";

export type ViewState = { id: PanelViewId; params?: Record<string, string | number | boolean | undefined> };
export type ViewRenderResult = { text: string; keyboard: UiKeyboard; parseMode?: "HTML" };
export type ViewRenderer = (ctx: AppContext, params: Record<string, string>) => Promise<ViewRenderResult>;

const registry = new Map<PanelViewId, ViewRenderer>();

export function registerView(id: PanelViewId, renderer: ViewRenderer): void {
  registry.set(id, renderer);
}

export function callbackFor(view: PanelViewId, params: Record<string, string | number | boolean | undefined> = {}): string {
  const query = Object.entries(params)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join("&");
  return query ? `nav:${view}?${query}` : `nav:${view}`;
}

function parseParams(raw?: string): Record<string, string> {
  if (!raw) return {};
  const params: Record<string, string> = {};
  for (const part of raw.split("&").filter(Boolean)) {
    const [key, value = ""] = part.split("=");
    params[decodeURIComponent(key)] = decodeURIComponent(value);
  }
  return params;
}

function isPanelViewId(value: string): value is PanelViewId {
  return PANEL_VIEW_IDS.has(value);
}

const PANEL_VIEW_IDS = new Set<string>([
  "home",
  "shop.categories",
  "shop.products",
  "shop.product",
  "shop.checkout",
  "shop.searchResults",
  "wallet",
  "account",
  "account.details",
  "account.history",
  "wallet.history",
  "deposit",
  "support",
  "referral",
  "freeAccount",
  "admin.dashboard",
  "admin.users",
  "admin.user",
  "admin.user.blocks",
  "admin.products",
  "admin.product",
  "admin.accounts",
  "admin.freeAccounts",
  "admin.coupons",
  "admin.crypto",
  "admin.store",
  "admin.referrals",
  "admin.analytics",
  "admin.deposits",
  "admin.deposit",
  "admin.orders",
  "admin.tickets",
  "admin.ticket",
]);

export function parseNavAction(action: string): ViewState | undefined {
  if (!action.startsWith("nav:")) return undefined;
  const raw = action.slice(4);
  const [id, params] = raw.split("?");
  if (!isPanelViewId(id)) return undefined;
  return { id, params: parseParams(params) };
}

export function panelKeyboard(rows: UiKeyboard, options: { back?: boolean; home?: boolean; cancel?: boolean } = { back: true, home: true }) {
  const normalized: InlineKeyboardButton.CallbackButton[][] = rows.map((row) => row.map((button) => Markup.button.callback(button.text, button.action)));
  const nav: InlineKeyboardButton.CallbackButton[] = [];
  if (options.back) nav.push(Markup.button.callback("⬅️ بازگشت", "nav:back"));
  if (options.home) nav.push(Markup.button.callback("🏠 خانه", callbackFor("home")));
  if (nav.length) normalized.push(nav);
  if (options.cancel) normalized.push([Markup.button.callback("❌ لغو", "flow:cancel")]);
  return Markup.inlineKeyboard(normalized);
}

export async function renderPanel(ctx: AppContext, state: ViewState, mode: "push" | "replace" | "back" = "push"): Promise<void> {
  const renderer = registry.get(state.id);
  if (!renderer) throw new Error(`View is not registered: ${state.id}`);
  const params: Record<string, string> = {};
  for (const [key, value] of Object.entries(state.params ?? {})) {
    params[key] = String(value ?? "");
  }
  const result = await renderer(ctx, params);

  ctx.session.navigation ??= { stack: [] };
  if (mode === "push") ctx.session.navigation.stack.push(state);
  if (mode === "replace") ctx.session.navigation.stack = [state];

  const extra = { parse_mode: result.parseMode, ...panelKeyboard(result.keyboard, { back: state.id !== "home", home: state.id !== "home" }) };
  if (ctx.callbackQuery?.message && "text" in ctx.callbackQuery.message) {
    await ctx.editMessageText(result.text, extra).catch(async () => {
      await ctx.editMessageReplyMarkup(panelKeyboard(result.keyboard, { back: state.id !== "home", home: state.id !== "home" }).reply_markup).catch(() => undefined);
      await ctx.reply(result.text, extra);
    });
    return;
  }
  const sent = await ctx.reply(result.text, extra);
  ctx.session.navigation.panelMessageId = sent.message_id;
}

export async function goBack(ctx: AppContext): Promise<void> {
  const stack = ctx.session.navigation?.stack ?? [];
  stack.pop();
  const previous = stack.pop() ?? { id: "home" };
  await renderPanel(ctx, previous, "push");
}
