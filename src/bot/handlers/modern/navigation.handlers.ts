import type { AppBot } from "../../../types/bot";
import { goBack, parseNavAction, renderPanel, RenderMode } from "../../navigation/panel-ui";
import { registerFlowEngine, handleActiveFlowPhoto } from "../../flows/flow-engine";
import { isAdminByTelegramId } from "../../middlewares/admin.middleware";
import { MonitoringService } from "../../../services/monitoring.service";

export function registerNavigationHandlers(bot: AppBot) {
  registerFlowEngine(bot);

  // Temporary compatibility redirects for old inline buttons. New visible buttons must use callbackFor()/nav:* actions.
  const legacyViews = new Map<string, Parameters<typeof renderPanel>[1]>([
    ["home", { id: "home" }],
    ["shop", { id: "shop" }],
    ["wallet", { id: "wallet" }],
    ["deposit", { id: "deposit" }],
    ["support", { id: "support" }],
    ["referral", { id: "referral" }],
    ["account", { id: "account" }],
    ["accounts", { id: "account.details" }],
    ["renew", { id: "account.renew" }],
    ["account:renew", { id: "account.renew" }],
    ["freeAccount", { id: "freeAccount" }],
    ["admin:dashboard", { id: "admin.dashboard" }],
    ["admin:deposits", { id: "admin.deposits" }],
    ["admin:tickets", { id: "admin.tickets" }],
    ["admin:users", { id: "admin.users" }],
    ["admin:coupons", { id: "admin.coupons" }],
  ]);

  for (const [action, state] of legacyViews.entries()) {
    bot.action(action, async (ctx) => {
      await ctx.answerCbQuery();
      if (state.id.startsWith("admin") && (!ctx.from || !(await isAdminByTelegramId(ctx.from.id)))) {
        await ctx.answerCbQuery("دسترسی غیرمجاز");
        return;
      }
      ctx.session.flow = undefined;
      if (action === "home") {
        ctx.session.liveTicketId = undefined;
        ctx.session.liveTicketRole = undefined;
      }
      await renderPanel(ctx, state, "replace");
    });
  }

  bot.action("cancel", async (ctx) => {
    ctx.session.flow = undefined;
    ctx.session.liveTicketId = undefined;
    ctx.session.liveTicketRole = undefined;
    await ctx.answerCbQuery("لغو شد");
    await renderPanel(ctx, { id: "home" }, "replace");
  });

  bot.action(/^nav:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => undefined);
    if (ctx.match[1] === "back") return goBack(ctx);
    const state = parseNavAction(`nav:${ctx.match[1]}`);
    if (!state) {
      MonitoringService.record({
        type: "BUTTON_DATA_INVALID",
        section: "Telegram Callback",
        description: `Invalid nav callback: nav:${ctx.match[1]}`,
        telegramId: ctx.from?.id ? String(ctx.from.id) : undefined,
        userId: ctx.state.userId,
        severity: "warning",
        suggestedAction: "callback_data دکمه‌های منتشرشده را بررسی کنید.",
      });
      return;
    }
    if (state.id.startsWith("admin") && (!ctx.from || !(await isAdminByTelegramId(ctx.from.id)))) {
      await ctx.answerCbQuery("دسترسی غیرمجاز").catch(() => undefined);
      return;
    }
    if (state.id === "account.xray") {
      await ctx.editMessageText("⏳ در حال دریافت اطلاعات سرویس...").catch(() => undefined);
    }
    await renderPanel(ctx, state, "push", RenderMode.EDIT_CURRENT);
  });

  bot.on("photo", async (ctx, next) => {
    const photo = ctx.message.photo[ctx.message.photo.length - 1];
    if (photo && (await handleActiveFlowPhoto(ctx, photo.file_id))) return;
    return next();
  });
}
