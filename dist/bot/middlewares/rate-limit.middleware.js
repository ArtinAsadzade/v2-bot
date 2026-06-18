"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rateLimitMiddleware = rateLimitMiddleware;
exports.rateLimit = rateLimit;
const logger_1 = require("../../services/logger");
const monitoring_service_1 = require("../../services/monitoring.service");
const WARNING_TEXT = "⚠️ لطفاً کمی آهسته‌تر ادامه دهید.\nبرای جلوگیری از اسپم، چند ثانیه صبر کنید و دوباره تلاش کنید.";
const WARNING_COOLDOWN_MS = 10000;
function envSeconds(name, fallback) {
    const value = Number(process.env[name]);
    return Number.isFinite(value) && value > 0 ? value : fallback;
}
const RULES = {
    message: { limit: 5, windowMs: 5000, blockMs: 10000 },
    callback: { limit: 8, windowMs: 5000, blockMs: 10000 },
    payment: { limit: 2, windowMs: 30000, blockMs: 30000 },
    wallet_topup: { limit: 1, windowMs: envSeconds("WALLET_TOPUP_RATE_LIMIT_SECONDS", 8) * 1000, blockMs: envSeconds("WALLET_TOPUP_RATE_LIMIT_SECONDS", 8) * 1000 },
    ticket: { limit: 5, windowMs: 60000, blockMs: 30000 },
    admin: { limit: 20, windowMs: 10000, blockMs: 10000 },
};
class InMemoryRateLimitStore {
    constructor() {
        this.entries = new Map();
    }
    consume(key, rule, now) {
        const entry = this.entries.get(key) ?? { hits: [] };
        entry.hits = entry.hits.filter((timestamp) => now - timestamp < rule.windowMs);
        if (entry.blockedUntil && entry.blockedUntil > now) {
            this.entries.set(key, entry);
            return { allowed: false, count: entry.hits.length, limit: rule.limit, blockedUntil: entry.blockedUntil, warningAllowed: this.canWarn(entry, now) };
        }
        entry.blockedUntil = undefined;
        entry.hits.push(now);
        if (entry.hits.length > rule.limit) {
            entry.blockedUntil = now + rule.blockMs;
            this.entries.set(key, entry);
            return { allowed: false, count: entry.hits.length, limit: rule.limit, blockedUntil: entry.blockedUntil, warningAllowed: this.canWarn(entry, now) };
        }
        this.entries.set(key, entry);
        return { allowed: true, count: entry.hits.length, limit: rule.limit, warningAllowed: false };
    }
    markWarned(key, now) {
        const entry = this.entries.get(key) ?? { hits: [] };
        entry.lastWarningAt = now;
        this.entries.set(key, entry);
    }
    canWarn(entry, now) {
        return !entry.lastWarningAt || now - entry.lastWarningAt >= WARNING_COOLDOWN_MS;
    }
}
const store = new InMemoryRateLimitStore();
function callbackData(ctx) {
    const callbackQuery = ctx.callbackQuery;
    return callbackQuery && "data" in callbackQuery ? callbackQuery.data : undefined;
}
function isWalletTopupAction(data) {
    return Boolean(data && (/^(deposit:wallet:|dep:wallet:)/.test(data) || data === "nav:deposit" || data === "flow:start:instant_topup"));
}
function isPaymentAction(data) {
    return Boolean(data && /^buy:(confirm|instant):/.test(data));
}
function isAdminAction(data) {
    return Boolean(data?.startsWith("admin:") || data?.startsWith("nav:admin."));
}
function isTicketAction(data) {
    return Boolean(data?.startsWith("support:") || data?.startsWith("admin:ticket:"));
}
function actionType(ctx) {
    if (!ctx.from)
        return undefined;
    const data = callbackData(ctx);
    if (data) {
        if (isWalletTopupAction(data))
            return "wallet_topup";
        if (isPaymentAction(data))
            return "payment";
        if (isAdminAction(data))
            return "admin";
        if (isTicketAction(data))
            return "ticket";
        return "callback";
    }
    if (ctx.message) {
        if (ctx.session.liveTicketId || ctx.session.state?.name === "support_message" || ctx.session.state?.name === "admin_ticket_reply")
            return "ticket";
        if (ctx.session.liveTicketRole === "admin" || ctx.session.flow?.name.startsWith("admin") || ctx.session.adminFlow)
            return "admin";
        if (ctx.session.state?.name === "deposit_amount" || ctx.session.state?.name === "deposit_receipt" || ctx.session.flow?.name === "deposit_submit" || ctx.session.flow?.name === "instant_topup")
            return "wallet_topup";
        return "message";
    }
    return undefined;
}
async function warnUser(ctx, type, remainingSeconds) {
    const text = type === "wallet_topup" ? `⚠️ برای جلوگیری از ثبت پرداخت تکراری، لطفاً ${remainingSeconds ?? "چند"} ثانیه صبر کنید و دوباره تلاش کنید.` : WARNING_TEXT;
    if (callbackData(ctx)) {
        await ctx.answerCbQuery(text, { show_alert: type === "payment" || type === "wallet_topup" || type === "admin" }).catch(() => undefined);
        return;
    }
    await ctx.reply(text).catch(() => undefined);
}
function rateLimitMiddleware() {
    return async (ctx, next) => {
        const telegramId = ctx.from?.id;
        const type = actionType(ctx);
        if (!telegramId || !type)
            return next();
        const rule = RULES[type];
        const key = `${telegramId}:${type}`;
        const now = Date.now();
        const result = store.consume(key, rule, now);
        if (result.allowed)
            return next();
        logger_1.logger.warn("RATE_LIMIT_HIT", {
            telegramId: String(telegramId),
            userId: ctx.state.userId,
            actionType: type,
            timestamp: new Date(now).toISOString(),
            count: result.count,
            limit: result.limit,
        });
        monitoring_service_1.MonitoringService.rateLimitHit({ telegramId: String(telegramId), userId: ctx.state.userId, actionType: type, count: result.count, limit: result.limit });
        if (result.warningAllowed) {
            store.markWarned(key, now);
            await warnUser(ctx, type, result.blockedUntil ? Math.max(1, Math.ceil((result.blockedUntil - now) / 1000)) : undefined);
        }
        else if (callbackData(ctx)) {
            await ctx.answerCbQuery().catch(() => undefined);
        }
    };
}
function rateLimit(userId, windowMs = 1000) {
    const result = store.consume(`legacy:${userId}`, { limit: 1, windowMs, blockMs: windowMs }, Date.now());
    return result.allowed;
}
