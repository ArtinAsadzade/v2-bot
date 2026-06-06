import { session, Telegraf } from "telegraf";
import type { AppContext } from "../types/bot";
import { logger } from "../services/logger";
import { UserService } from "../modules/user/user.service";
import { handleAdminFlow } from "./handlers/admin/admin.flow.handler";
import { notificationService, registerNotificationEvents } from "../services/notification.service";
import { SupportService } from "../modules/support/support.service";

if (!process.env.BOT_TOKEN) {
  throw new Error("BOT_TOKEN is missing");
}

export const bot = new Telegraf<AppContext>(process.env.BOT_TOKEN);
notificationService.setBot(bot);
registerNotificationEvents();

// ---------------- SESSION ----------------
bot.use(
  session({
    defaultSession: () => ({ selectedCoupons: {} }),
  }),
);

// ---------------- USER INIT ----------------
bot.use(async (ctx, next) => {
  if (ctx.from) {
    await UserService.findOrCreateUser(ctx);
  }
  await next();
});


// ---------------- ADMIN LIVE CHAT ----------------
bot.on("text", async (ctx, next) => {
  if (!ctx.session.liveTicketId || !ctx.from || !(ctx.message && "text" in ctx.message)) return next();

  await SupportService.addAdminReply(ctx.session.liveTicketId, String(ctx.from.id), ctx.message.text.trim());
  await ctx.reply("✅ پیام در چت تیکت ارسال شد.");
});

// ---------------- ADMIN FLOW ----------------
bot.on("text", async (ctx, next) => {
  const handled = await handleAdminFlow(ctx);
  if (handled) return;
  return next();
});

// ---------------- ERROR HANDLER ----------------
bot.catch((error, ctx) => {
  logger.error("Unhandled bot error", {
    updateId: ctx.update.update_id,
    error: error instanceof Error ? error.message : String(error),
  });
});
