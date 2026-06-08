import { Markup } from "telegraf";
import type { InlineKeyboardButton } from "telegraf/types";
import type { AppContext } from "../../types/bot";
import { replyKeyboard, replyKeyboardSignature, type ReplyKeyboardScope } from "../keyboards/reply.keyboard";

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
  | "admin.categories"
  | "admin.category"
  | "admin.accounts"
  | "admin.account"
  | "admin.account.move"
  | "admin.wallets"
  | "admin.wallet"
  | "admin.freeAccounts"
  | "admin.coupons"
  | "admin.coupon"
  | "admin.crypto"
  | "admin.store"
  | "admin.forcedJoin"
  | "admin.referrals"
  | "admin.analytics"
  | "admin.transactions"
  | "admin.notifications"
  | "admin.settings"
  | "admin.paymentGateway"
  | "admin.paymentStats"
  | "admin.invoices"
  | "admin.invoice"
  | "admin.deposits"
  | "admin.deposit"
  | "admin.orders"
  | "admin.tickets"
  | "admin.ticket";

export type ViewState = { id: PanelViewId; params?: Record<string, string | number | boolean | undefined> };
export type ViewRenderResult = { text: string; keyboard: UiKeyboard; parseMode?: "HTML"; replyKeyboard?: ReplyKeyboardScope };
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
  "admin.categories",
  "admin.category",
  "admin.accounts",
  "admin.account",
  "admin.account.move",
  "admin.wallets",
  "admin.wallet",
  "admin.freeAccounts",
  "admin.coupons",
  "admin.coupon",
  "admin.crypto",
  "admin.store",
  "admin.forcedJoin",
  "admin.referrals",
  "admin.analytics",
  "admin.transactions",
  "admin.notifications",
  "admin.settings",
  "admin.paymentGateway",
  "admin.paymentStats",
  "admin.invoices",
  "admin.invoice",
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
  if (options.home) nav.push(Markup.button.callback("🏠 منوی اصلی", callbackFor("home")));
  if (nav.length) normalized.push(nav);
  if (options.cancel) normalized.push([Markup.button.callback("❌ لغو عملیات", "flow:cancel")]);
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

  if (result.replyKeyboard) {
    const signature = replyKeyboardSignature(result.replyKeyboard);
    if (ctx.session.quickKeyboardSignature !== signature) {
      ctx.session.quickKeyboardSignature = signature;
      await ctx.reply("⌨️ منوی دسترسی سریع به‌روزرسانی شد.", replyKeyboard(result.replyKeyboard));
    }
  }

  const keyboard = panelKeyboard(result.keyboard, { back: state.id !== "home", home: state.id !== "home" });
  const extra = { parse_mode: result.parseMode, ...keyboard };
  const fallbackReply = async () => {
    const sent = await ctx.reply(result.text, extra);
    ctx.session.navigation!.panelMessageId = sent.message_id;
  };

  if (ctx.callbackQuery?.message && "text" in ctx.callbackQuery.message) {
    await ctx.editMessageText(result.text, extra).catch(async () => {
      await ctx.editMessageReplyMarkup(keyboard.reply_markup).catch(() => undefined);
      await fallbackReply();
    });
    return;
  }

  const chatId = ctx.chat?.id;
  const panelMessageId = ctx.session.navigation.panelMessageId;
  if (chatId && panelMessageId) {
    const edited = await ctx.telegram
      .editMessageText(chatId, panelMessageId, undefined, result.text, extra)
      .then(() => true)
      .catch(() => false);
    if (edited) return;
  }

  await fallbackReply();
}

export async function goBack(ctx: AppContext): Promise<void> {
  const stack = ctx.session.navigation?.stack ?? [];
  stack.pop();
  const previous = stack.pop() ?? { id: "home" };
  await renderPanel(ctx, previous, "push");
}
