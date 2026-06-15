"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PANEL_VIEW_IDS = exports.RenderMode = void 0;
exports.registerView = registerView;
exports.registeredPanelViewIds = registeredPanelViewIds;
exports.isValidCallbackData = isValidCallbackData;
exports.ensureCallbackData = ensureCallbackData;
exports.actionFor = actionFor;
exports.callbackFor = callbackFor;
exports.parseNavAction = parseNavAction;
exports.panelKeyboard = panelKeyboard;
exports.renderPanel = renderPanel;
exports.goBack = goBack;
const telegraf_1 = require("telegraf");
const reply_keyboard_1 = require("../keyboards/reply.keyboard");
const admin_middleware_1 = require("../middlewares/admin.middleware");
var RenderMode;
(function (RenderMode) {
    RenderMode["EDIT_CURRENT"] = "EDIT_CURRENT";
    RenderMode["SEND_NEW"] = "SEND_NEW";
    RenderMode["AUTO"] = "AUTO";
})(RenderMode || (exports.RenderMode = RenderMode = {}));
const registry = new Map();
function registerView(id, renderer) {
    registry.set(id, renderer);
}
function registeredPanelViewIds() {
    return [...registry.keys()];
}
const PARAM_ALIASES = {
    page: "p",
    productPage: "pp",
    productId: "pid",
    categoryId: "cid",
    accountId: "aid",
    xrayClientId: "xid",
    userId: "uid",
    walletId: "wid",
    couponId: "co",
    invoiceId: "iid",
    ticketId: "tid",
    depositId: "did",
    status: "s",
};
const PARAM_ALIAS_REVERSE = Object.fromEntries(Object.entries(PARAM_ALIASES).map(([key, value]) => [value, key]));
const PARAM_VALUE_ALIASES = {
    status: { all: "a", active: "ac", provisioning: "p", creating: "c", failed: "f", expired: "e", disabled: "d", missing_on_panel: "m" },
};
const PARAM_VALUE_ALIAS_REVERSE = Object.fromEntries(Object.entries(PARAM_VALUE_ALIASES).map(([key, values]) => [key, Object.fromEntries(Object.entries(values).map(([value, alias]) => [alias, value]))]));
function isValidCallbackData(action) {
    return Buffer.byteLength(action, "utf8") <= 64;
}
function ensureCallbackData(action) {
    if (!isValidCallbackData(action)) {
        throw new Error(`Telegram callback payload is too long (${Buffer.byteLength(action, "utf8")} bytes): ${action}`);
    }
    return action;
}
function actionFor(prefix, ...parts) {
    return ensureCallbackData([prefix, ...parts.filter((part) => part !== undefined && part !== "").map(String)].join(":"));
}
function callbackFor(view, params = {}) {
    const query = Object.entries(params)
        .filter(([, value]) => value !== undefined && value !== "")
        .map(([key, value]) => {
        const normalizedValue = PARAM_VALUE_ALIASES[key]?.[String(value)] ?? String(value);
        return `${encodeURIComponent(PARAM_ALIASES[key] ?? key)}=${encodeURIComponent(normalizedValue)}`;
    })
        .join("&");
    const callback = query ? `nav:${view}?${query}` : `nav:${view}`;
    return ensureCallbackData(callback);
}
function parseParams(raw) {
    if (!raw)
        return {};
    const params = {};
    for (const part of raw.split("&").filter(Boolean)) {
        const [key, value = ""] = part.split("=");
        const fullKey = PARAM_ALIAS_REVERSE[decodeURIComponent(key)] ?? decodeURIComponent(key);
        const decodedValue = decodeURIComponent(value);
        params[fullKey] = PARAM_VALUE_ALIAS_REVERSE[fullKey]?.[decodedValue] ?? decodedValue;
    }
    return params;
}
function isPanelViewId(value) {
    return exports.PANEL_VIEW_IDS.has(value);
}
exports.PANEL_VIEW_IDS = new Set([
    "home",
    "shop.categories",
    "shop.products",
    "shop.product",
    "shop.checkout",
    "shop.searchResults",
    "wallet",
    "account",
    "account.details",
    "account.xray",
    "account.renew",
    "account.renew.products",
    "account.renew.summary",
    "account.history",
    "wallet.history",
    "deposit",
    "support",
    "referral",
    "freeAccount",
    "productGuide",
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
    "admin.finance",
    "admin.usersSupport",
    "admin.content",
    "admin.botSettings",
    "admin.monitoring",
    "admin.forcedJoin",
    "admin.productGuides",
    "admin.referrals",
    "admin.analytics",
    "admin.transactions",
    "admin.notifications",
    "admin.settings",
    "admin.xraySettings",
    "admin.xrayClients",
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
    const seenNav = new Set();
    const normalized = rows
        .map((row) => row
        .filter((button) => {
        if ((button.action === "nav:back" || button.action === callbackFor("home")) && seenNav.has(button.action))
            return false;
        if (button.action === "nav:back" || button.action === callbackFor("home"))
            seenNav.add(button.action);
        return true;
    })
        .flatMap((button) => {
        try {
            return [telegraf_1.Markup.button.callback(button.text, ensureCallbackData(button.action))];
        }
        catch (error) {
            console.error("CALLBACK_DATA_INVALID_PREVENTED", { text: button.text, action: button.action, error: error instanceof Error ? error.message : String(error) });
            return [];
        }
    }))
        .filter((row) => row.length > 0);
    const nav = [];
    if (options.back && !seenNav.has("nav:back"))
        nav.push(telegraf_1.Markup.button.callback("🔙 بازگشت", ensureCallbackData("nav:back")));
    if (options.home && !seenNav.has(callbackFor("home")))
        nav.push(telegraf_1.Markup.button.callback("🏠 خانه", callbackFor("home")));
    if (nav.length)
        normalized.push(nav);
    if (options.cancel)
        normalized.push([telegraf_1.Markup.button.callback("❌ لغو عملیات", "flow:cancel")]);
    return telegraf_1.Markup.inlineKeyboard(normalized);
}
async function renderPanel(ctx, state, mode = "push", renderMode = RenderMode.AUTO) {
    var _a;
    const renderer = registry.get(state.id);
    if (!renderer)
        throw new Error(`View is not registered: ${state.id}`);
    const params = {};
    for (const [key, value] of Object.entries(state.params ?? {})) {
        params[key] = String(value ?? "");
    }
    let result;
    try {
        result = await renderer(ctx, params);
    }
    catch (error) {
        console.error("PANEL_RENDER_FAILED", { state, error: error instanceof Error ? error.message : String(error) });
        result = {
            text: "❌ نمایش این بخش ممکن نیست\n\nلطفاً از منوی اصلی دوباره وارد شوید.",
            keyboard: [[{ text: "🏠 خانه", action: callbackFor("home") }, { text: "🎫 پشتیبانی", action: callbackFor("support") }]],
        };
        renderMode = RenderMode.SEND_NEW;
    }
    (_a = ctx.session).navigation ?? (_a.navigation = { stack: [] });
    if (mode === "push")
        ctx.session.navigation.stack.push(state);
    if (mode === "replace")
        ctx.session.navigation.stack = [state];
    if (result.replyKeyboard) {
        const isAdmin = result.replyKeyboard !== "admin" && result.replyKeyboard !== "settings" && ctx.from ? await (0, admin_middleware_1.isAdminByTelegramId)(ctx.from.id) : false;
        const signature = (0, reply_keyboard_1.replyKeyboardSignature)(result.replyKeyboard, { isAdmin });
        if (!ctx.callbackQuery && ctx.session.quickKeyboardSignature !== signature) {
            await ctx.reply("⌨️ منوی دسترسی سریع", (0, reply_keyboard_1.replyKeyboard)(result.replyKeyboard, { isAdmin }));
        }
        ctx.session.quickKeyboardSignature = signature;
    }
    const isHome = state.id === "home";
    const keyboard = panelKeyboard(result.keyboard, { back: result.navigation?.back ?? !isHome, home: result.navigation?.home ?? !isHome });
    const extra = { parse_mode: result.parseMode, ...keyboard };
    const fallbackReply = async () => {
        try {
            const sent = await ctx.reply(result.text, extra);
            ctx.session.navigation.panelMessageId = sent.message_id;
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (!message.includes("BUTTON_DATA_INVALID"))
                throw error;
            console.error("BUTTON_DATA_INVALID_REPLY_FALLBACK", { state, error: message });
            const sent = await ctx.reply("نمایش این بخش با خطای دکمه مواجه شد. لطفاً دوباره تلاش کنید.", panelKeyboard([[{ text: "🏠 خانه", action: callbackFor("home") }]], { back: false, home: false }));
            ctx.session.navigation.panelMessageId = sent.message_id;
        }
    };
    const effectiveRenderMode = result.renderMode ?? renderMode;
    const shouldEdit = effectiveRenderMode === RenderMode.EDIT_CURRENT || (effectiveRenderMode === RenderMode.AUTO && Boolean(ctx.callbackQuery?.message && "text" in ctx.callbackQuery.message));
    if (shouldEdit && ctx.callbackQuery?.message && "text" in ctx.callbackQuery.message) {
        await ctx.editMessageText(result.text, extra).catch(async (error) => {
            const message = error instanceof Error ? error.message : String(error);
            if (message.includes("BUTTON_DATA_INVALID")) {
                console.error("BUTTON_DATA_INVALID_RENDER_FALLBACK", { state, error: message });
                result.text = "نمایش این بخش با خطای دکمه مواجه شد. لطفاً دوباره تلاش کنید.";
            }
            await ctx.editMessageReplyMarkup(keyboard.reply_markup).catch(() => undefined);
            await fallbackReply().catch(async (replyError) => {
                console.error("PANEL_FALLBACK_REPLY_FAILED", { state, error: replyError instanceof Error ? replyError.message : String(replyError) });
            });
        });
        return;
    }
    await fallbackReply();
}
async function goBack(ctx) {
    const stack = ctx.session.navigation?.stack ?? [];
    stack.pop();
    const previous = stack.pop() ?? { id: "home" };
    await renderPanel(ctx, previous, "push", RenderMode.EDIT_CURRENT);
}
