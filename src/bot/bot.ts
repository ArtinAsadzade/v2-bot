import { session, Telegraf } from "telegraf";
import type { AppContext } from "../types/bot";
import { logger } from "../services/logger";
import { UserService } from "../modules/user/user.service";
import { notificationService, registerNotificationEvents } from "../services/notification.service";
import { accessControlMiddleware } from "./middlewares/access-control.middleware";
import { forcedJoinMiddleware } from "./middlewares/forced-join.middleware";
import { rateLimitMiddleware } from "./middlewares/rate-limit.middleware";

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
  logger.error("Unhandled bot error", {
    updateId: ctx.update.update_id,
    error: error instanceof Error ? error.message : String(error),
  });
});
