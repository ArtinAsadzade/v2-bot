"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerView = registerView;
exports.callbackFor = callbackFor;
exports.parseNavAction = parseNavAction;
exports.panelKeyboard = panelKeyboard;
exports.renderPanel = renderPanel;
exports.goBack = goBack;
const telegraf_1 = require("telegraf");
const registry = new Map();
function registerView(id, renderer) {
    registry.set(id, renderer);
}
function callbackFor(view, params = {}) {
    const query = Object.entries(params)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
        .join("&");
    return query ? `nav:${view}?${query}` : `nav:${view}`;
}
function parseParams(raw) {
    if (!raw)
        return {};
    const params = {};
    for (const part of raw.split("&").filter(Boolean)) {
        const [key, value = ""] = part.split("=");
        params[decodeURIComponent(key)] = decodeURIComponent(value);
    }
    return params;
}
function isPanelViewId(value) {
    return PANEL_VIEW_IDS.has(value);
}
const PANEL_VIEW_IDS = new Set([
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
    "admin.coupon",
    "admin.crypto",
    "admin.store",
    "admin.forcedJoin",
    "admin.referrals",
    "admin.analytics",
    "admin.deposits",
    "admin.deposit",
    "admin.orders",
    "admin.tickets",
    "admin.ticket",
]);
function parseNavAction(action) {
    if (!action.startsWith("nav:"))
        return undefined;
    const raw = action.slice(4);
    const [id, params] = raw.split("?");
    if (!isPanelViewId(id))
        return undefined;
    return { id, params: parseParams(params) };
}
function panelKeyboard(rows, options = { back: true, home: true }) {
    const normalized = rows.map((row) => row.map((button) => telegraf_1.Markup.button.callback(button.text, button.action)));
    const nav = [];
    if (options.back)
        nav.push(telegraf_1.Markup.button.callback("⬅️ بازگشت", "nav:back"));
    if (options.home)
        nav.push(telegraf_1.Markup.button.callback("🏠 خانه", callbackFor("home")));
    if (nav.length)
        normalized.push(nav);
    if (options.cancel)
        normalized.push([telegraf_1.Markup.button.callback("❌ لغو", "flow:cancel")]);
    return telegraf_1.Markup.inlineKeyboard(normalized);
}
async function renderPanel(ctx, state, mode = "push") {
    var _a;
    const renderer = registry.get(state.id);
    if (!renderer)
        throw new Error(`View is not registered: ${state.id}`);
    const params = {};
    for (const [key, value] of Object.entries(state.params ?? {})) {
        params[key] = String(value ?? "");
    }
    const result = await renderer(ctx, params);
    (_a = ctx.session).navigation ?? (_a.navigation = { stack: [] });
    if (mode === "push")
        ctx.session.navigation.stack.push(state);
    if (mode === "replace")
        ctx.session.navigation.stack = [state];
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
async function goBack(ctx) {
    const stack = ctx.session.navigation?.stack ?? [];
    stack.pop();
    const previous = stack.pop() ?? { id: "home" };
    await renderPanel(ctx, previous, "push");
}
