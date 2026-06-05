import dotenv from "dotenv";
import { bot } from "./bot/bot";
import "./bot/handlers/start";
import { logger } from "./services/logger";
import "./bot/handlers/start";
import "./bot/handlers/wallet";
import "./bot/handlers/deposit/start";
import "./bot/handlers/deposit/create";
import "./bot/handlers/deposit/receipt";
import "./bot/handlers/admin/deposit.admin";
import "./bot/handlers/support/start";
import "./bot/handlers/support/messages";
import "./bot/handlers/admin/support.admin";
import "./bot/handlers/coupon/apply";
import "./bot/handlers/admin/panel";
import "./bot/handlers/admin/coupon.admin";

dotenv.config();

async function bootstrap() {
  try {
    logger.info("Bot starting...");

    await bot.launch();

    logger.info("Bot is running");
  } catch (err) {
    logger.error("Failed to start bot");
    console.error(err);
  }
}

bootstrap();

// graceful shutdown
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
