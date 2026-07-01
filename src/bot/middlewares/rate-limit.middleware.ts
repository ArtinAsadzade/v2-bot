import type { MiddlewareFn } from "telegraf";
import type { AppContext } from "../../types/bot";
import { logger } from "../../services/logger";
import { MonitoringService } from "../../services/monitoring.service";
import { rateLimitService, type RateLimitGroup, type UserRole } from "../../services/rate-limit.service";

const WARNING_TEXT = "⚠️ درخواست‌های شما بیش از حد سریع ارسال شدند.\n\nچند لحظه صبر کنید و دوباره تلاش کنید.";

function callbackData(ctx: AppContext) {
  const callbackQuery = ctx.callbackQuery;
  return callbackQuery && "data" in callbackQuery ? callbackQuery.data : undefined;
}

function messageText(ctx: AppContext) {
  return ctx.message && "text" in ctx.message ? ctx.message.text : undefined;
}

function isStart(ctx: AppContext) {
  return messageText(ctx)?.startsWith("/start") === true;
}

function isNavigation(data?: string, text?: string) {
  if (data?.startsWith("nav:") || data === "flow:back" || data === "flow:cancel") return true;
  return Boolean(text && ["خانه", "فروشگاه", "سرویس‌های من", "پیش‌بینی", "کیف پول", "دعوت دوستان", "Support", "پشتیبانی"].includes(text));
}

function isPayment(data?: string) {
  return Boolean(data && (/^(deposit:wallet:|dep:wallet:)/.test(data) || data === "nav:deposit" || data === "flow:start:instant_topup" || /^buy:(confirm|instant):/.test(data) || /payment|invoice|gateway|wallet/i.test(data)));
}

function isPurchase(data?: string, flowName?: string) {
  return Boolean(data && (/^(buy:|coupon:|shop:)/.test(data) || data.startsWith("nav:shop") || data.includes("checkout")) || flowName === "coupon_code" || flowName === "product_search");
}

function isReward(data?: string) { return Boolean(data?.startsWith("reward:claim:")); }
function isPrediction(data?: string, flowName?: string) { return Boolean(data?.includes("prediction") || data?.startsWith("pred:") || flowName?.startsWith("prediction_")); }
function isAdminAction(data?: string, ctx?: AppContext) { return Boolean(data?.startsWith("admin:") || data?.startsWith("nav:admin.") || ctx?.session.liveTicketRole === "admin" || ctx?.session.flow?.name.startsWith("admin") || ctx?.session.adminFlow); }
function isSupport(data?: string, ctx?: AppContext) { return Boolean(data?.startsWith("support:") || data?.startsWith("admin:ticket:") || ctx?.session.liveTicketId || ctx?.session.state?.name === "support_message" || ctx?.session.state?.name === "admin_ticket_reply"); }
function isSearch(ctx: AppContext) { return Boolean(ctx.session.flow?.name === "product_search" || ctx.session.state?.name?.includes("search")); }

export function rateLimitGroup(ctx: AppContext): RateLimitGroup | undefined {
  if (!ctx.from || isStart(ctx)) return undefined;
  const data = callbackData(ctx);
  const text = messageText(ctx);
  const flowName = ctx.session.flow?.name;

  if (isAdminAction(data, ctx)) return "admin";
  if (isNavigation(data, text)) return "navigation";
  if (isReward(data)) return "reward";
  if (isPayment(data)) return "payments";
  if (isPurchase(data, flowName)) return "purchase";
  if (isPrediction(data, flowName)) return "prediction";
  if (isSupport(data, ctx)) return "support";
  if (isSearch(ctx)) return "search";
  if (data) return "callbacks";
  if (ctx.message) return "callbacks";
  return undefined;
}

function role(ctx: AppContext): UserRole {
  const stateRole = (ctx.state as { userRole?: UserRole }).userRole;
  return stateRole === "admin" || stateRole === "superadmin" ? stateRole : "user";
}

async function warnUser(ctx: AppContext, remainingSeconds?: number) {
  const wait = remainingSeconds ? `\n\nلطفاً ${remainingSeconds.toLocaleString("fa-IR")} ثانیه دیگر دوباره تلاش کنید.` : "";
  const text = `${WARNING_TEXT}${wait}`;
  if (callbackData(ctx)) {
    await ctx.answerCbQuery(text, { show_alert: false }).catch(() => undefined);
    return;
  }
  await ctx.reply(text).catch(() => undefined);
}

export function rateLimitMiddleware(): MiddlewareFn<AppContext> {
  return async (ctx, next) => {
    const telegramId = ctx.from?.id;
    const group = rateLimitGroup(ctx);
    if (!telegramId || !group) return next();

    const userRole = role(ctx);
    const result = rateLimitService.consume({ subject: String(telegramId), group, role: userRole });
    if (result.allowed) return next();

    logger.warn("RATE_LIMIT_HIT", { telegramId: String(telegramId), userId: ctx.state.userId, actionType: result.group, count: result.count, limit: result.limit });
    MonitoringService.rateLimitHit({ telegramId: String(telegramId), userId: ctx.state.userId, actionType: result.group, count: result.count, limit: result.limit });

    if (result.warningAllowed) {
      rateLimitService.markWarned({ subject: String(telegramId), group, role: userRole });
      await warnUser(ctx, result.retryAfterSeconds);
    } else if (callbackData(ctx)) {
      await ctx.answerCbQuery().catch(() => undefined);
    }
  };
}

export function rateLimit(userId: string, windowMs = 1000) {
  const result = rateLimitService.consume({ subject: `legacy:${userId}`, group: "callbacks", now: Date.now() });
  return result.allowed || windowMs <= 0;
}
