import { session, Telegraf } from "telegraf";
import type { AppContext } from "../types/bot";
import { logger } from "../services/logger";
import { UserService } from "../modules/user/user.service";
import { notificationService, registerNotificationEvents } from "../services/notification.service";
import { accessControlMiddleware } from "./middlewares/access-control.middleware";

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
  if (ctx.from) await UserService.findOrCreateUser(ctx);
  await next();
});

bot.use(accessControlMiddleware());

bot.catch((error, ctx) => {
  logger.error("Unhandled bot error", {
    updateId: ctx.update.update_id,
    error: error instanceof Error ? error.message : String(error),
  });
});
