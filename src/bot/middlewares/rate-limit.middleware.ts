import type { MiddlewareFn } from "telegraf";
import type { AppContext } from "../../types/bot";
import { logger } from "../../services/logger";
import { MonitoringService } from "../../services/monitoring.service";

export type RateLimitAction = "message" | "callback" | "payment" | "wallet_topup" | "ticket" | "admin";

type RateLimitRule = {
  limit: number;
  windowMs: number;
  blockMs: number;
};

type RateLimitEntry = {
  hits: number[];
  blockedUntil?: number;
  lastWarningAt?: number;
};

type RateLimitResult = {
  allowed: boolean;
  count: number;
  limit: number;
  blockedUntil?: number;
  warningAllowed: boolean;
};

interface RateLimitStore {
  consume(key: string, rule: RateLimitRule, now: number): RateLimitResult;
  markWarned(key: string, now: number): void;
}

const WARNING_TEXT = "⚠️ لطفاً کمی آهسته‌تر ادامه دهید.\nبرای جلوگیری از اسپم، چند ثانیه صبر کنید و دوباره تلاش کنید.";
const WARNING_COOLDOWN_MS = 10_000;

function envSeconds(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const RULES: Record<RateLimitAction, RateLimitRule> = {
  message: { limit: 5, windowMs: 5_000, blockMs: 10_000 },
  callback: { limit: 8, windowMs: 5_000, blockMs: 10_000 },
  payment: { limit: 2, windowMs: 30_000, blockMs: 30_000 },
  wallet_topup: { limit: 1, windowMs: envSeconds("WALLET_TOPUP_RATE_LIMIT_SECONDS", 8) * 1000, blockMs: envSeconds("WALLET_TOPUP_RATE_LIMIT_SECONDS", 8) * 1000 },
  ticket: { limit: 5, windowMs: 60_000, blockMs: 30_000 },
  admin: { limit: 20, windowMs: 10_000, blockMs: 10_000 },
};

class InMemoryRateLimitStore implements RateLimitStore {
  private readonly entries = new Map<string, RateLimitEntry>();

  consume(key: string, rule: RateLimitRule, now: number): RateLimitResult {
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

  markWarned(key: string, now: number) {
    const entry = this.entries.get(key) ?? { hits: [] };
    entry.lastWarningAt = now;
    this.entries.set(key, entry);
  }

  private canWarn(entry: RateLimitEntry, now: number) {
    return !entry.lastWarningAt || now - entry.lastWarningAt >= WARNING_COOLDOWN_MS;
  }
}

const store = new InMemoryRateLimitStore();

function callbackData(ctx: AppContext) {
  const callbackQuery = ctx.callbackQuery;
  return callbackQuery && "data" in callbackQuery ? callbackQuery.data : undefined;
}

function isWalletTopupAction(data?: string) {
  return Boolean(data && (/^(deposit:wallet:|dep:wallet:)/.test(data) || data === "nav:deposit" || data === "flow:start:instant_topup"));
}

function isPaymentAction(data?: string) {
  return Boolean(data && /^buy:(confirm|instant):/.test(data));
}

function isAdminAction(data?: string) {
  return Boolean(data?.startsWith("admin:") || data?.startsWith("nav:admin."));
}

function isTicketAction(data?: string) {
  return Boolean(data?.startsWith("support:") || data?.startsWith("admin:ticket:"));
}

function actionType(ctx: AppContext): RateLimitAction | undefined {
  if (!ctx.from) return undefined;

  const data = callbackData(ctx);
  if (data) {
    if (isWalletTopupAction(data)) return "wallet_topup";
    if (isPaymentAction(data)) return "payment";
    if (isAdminAction(data)) return "admin";
    if (isTicketAction(data)) return "ticket";
    return "callback";
  }

  if (ctx.message) {
    if (ctx.session.liveTicketId || ctx.session.state?.name === "support_message" || ctx.session.state?.name === "admin_ticket_reply") return "ticket";
    if (ctx.session.liveTicketRole === "admin" || ctx.session.flow?.name.startsWith("admin") || ctx.session.adminFlow) return "admin";
    if (ctx.session.state?.name === "deposit_amount" || ctx.session.state?.name === "deposit_receipt" || ctx.session.flow?.name === "deposit_submit" || ctx.session.flow?.name === "instant_topup") return "wallet_topup";
    return "message";
  }

  return undefined;
}

async function warnUser(ctx: AppContext, type: RateLimitAction, remainingSeconds?: number) {
  const text = type === "wallet_topup" ? `⚠️ برای جلوگیری از ثبت پرداخت تکراری، لطفاً ${remainingSeconds ?? "چند"} ثانیه صبر کنید و دوباره تلاش کنید.` : WARNING_TEXT;
  if (callbackData(ctx)) {
    await ctx.answerCbQuery(text, { show_alert: type === "payment" || type === "wallet_topup" || type === "admin" }).catch(() => undefined);
    return;
  }
  await ctx.reply(text).catch(() => undefined);
}

export function rateLimitMiddleware(): MiddlewareFn<AppContext> {
  return async (ctx, next) => {
    const telegramId = ctx.from?.id;
    const type = actionType(ctx);
    if (!telegramId || !type) return next();

    const rule = RULES[type];
    const key = `${telegramId}:${type}`;
    const now = Date.now();
    const result = store.consume(key, rule, now);

    if (result.allowed) return next();

    logger.warn("RATE_LIMIT_HIT", {
      telegramId: String(telegramId),
      userId: ctx.state.userId,
      actionType: type,
      timestamp: new Date(now).toISOString(),
      count: result.count,
      limit: result.limit,
    });
    MonitoringService.rateLimitHit({ telegramId: String(telegramId), userId: ctx.state.userId, actionType: type, count: result.count, limit: result.limit });

    if (result.warningAllowed) {
      store.markWarned(key, now);
      await warnUser(ctx, type, result.blockedUntil ? Math.max(1, Math.ceil((result.blockedUntil - now) / 1000)) : undefined);
    } else if (callbackData(ctx)) {
      await ctx.answerCbQuery().catch(() => undefined);
    }
  };
}

export function rateLimit(userId: string, windowMs = 1000) {
  const result = store.consume(`legacy:${userId}`, { limit: 1, windowMs, blockMs: windowMs }, Date.now());
  return result.allowed;
}
