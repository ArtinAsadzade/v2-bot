import { session, Telegraf } from "telegraf";
import type { AppContext } from "../types/bot";
import { logger } from "../services/logger";

if (!process.env.BOT_TOKEN) {
  throw new Error("BOT_TOKEN is missing");
}

export const bot = new Telegraf<AppContext>(process.env.BOT_TOKEN);

bot.use(
  session({
    defaultSession: () => ({}),
  }),
);

bot.catch((error, ctx) => {
  logger.error("Unhandled bot error", {
    updateId: ctx.update.update_id,
    error: error instanceof Error ? error.message : String(error),
  });
});
