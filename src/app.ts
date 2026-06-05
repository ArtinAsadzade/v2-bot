import dotenv from "dotenv";
import { bot } from "./bot/bot";
import "./bot/handlers/start";
import { logger } from "./services/logger";
import "./bot/handlers/start";
import "./bot/handlers/wallet";

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
