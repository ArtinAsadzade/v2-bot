import { session, Telegraf } from "telegraf";
import type { AppContext } from "../types/bot";
import { logger } from "../services/logger";
import { UserService } from "../modules/user/user.service";
import { notificationService, registerNotificationEvents } from "../services/notification.service";
import { accessControlMiddleware } from "./middlewares/access-control.middleware";
import { forcedJoinMiddleware } from "./middlewares/forced-join.middleware";
import { rateLimitMiddleware } from "./middlewares/rate-limit.middleware";
import { MonitoringService } from "../services/monitoring.service";

if (!process.env.BOT_TOKEN) {
  throw new Error("BOT_TOKEN is missing");
}

export const bot = new Telegraf<AppContext>(process.env.BOT_TOKEN);
notificationService.setBot(bot);
registerNotificationEvents();

bot.use(
  session({
    defaultSession: () => ({ selectedCoupons: {}, navigation: { stack: [] } }),
  }),
);

bot.use(async (ctx, next) => {
  if (ctx.from) {
    const user = await UserService.findOrCreateUser(ctx);
    ctx.state.userId = user.id;
  }
  await next();
});

bot.use(rateLimitMiddleware());
bot.use(accessControlMiddleware());
bot.use(forcedJoinMiddleware());

bot.catch((error, ctx) => {
  const message = error instanceof Error ? error.message : String(error);
  logger.error("Unhandled bot error", {
    updateId: ctx.update.update_id,
    error: message,
  });
  MonitoringService.record({ type: "UNHANDLED_BOT_ERROR", section: "Telegram Bot", description: message, telegramId: ctx.from?.id ? String(ctx.from.id) : undefined, userId: ctx.state.userId, severity: "critical", suggestedAction: "لاگ سرور و آخرین آپدیت تلگرام را بررسی کنید." });
});
