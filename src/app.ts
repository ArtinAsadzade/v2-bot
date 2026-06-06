import dotenv from "dotenv";

dotenv.config();

import { bot } from "./bot/bot";
import { registerHandlers } from "./bot/handlers";
import { cleanExpiredDeposits } from "./jobs/depositCleaner";
import { deactivateExpiredAccounts } from "./jobs/accountExpiration";
import { logger } from "./services/logger";
import { CryptoRateService } from "./modules/system/system.service";
import { prisma } from "./services/prisma";

async function bootstrap() {
  try {
    logger.info("Bot starting...");
    registerHandlers(bot);

    await CryptoRateService.refreshAll().catch((error) => logger.error("Initial crypto rate refresh failed", { error: error instanceof Error ? error.message : String(error) }));
    await cleanExpiredDeposits().catch((error) => logger.error("Initial deposit cleaner failed", { error: error instanceof Error ? error.message : String(error) }));
    await deactivateExpiredAccounts().catch((error) => logger.error("Initial account expiration job failed", { error: error instanceof Error ? error.message : String(error) }));
    setInterval(() => {
      cleanExpiredDeposits().catch((error) => logger.error("Deposit cleaner failed", { error: error instanceof Error ? error.message : String(error) }));
      deactivateExpiredAccounts().catch((error) => logger.error("Account expiration job failed", { error: error instanceof Error ? error.message : String(error) }));
    }, 60_000);
    setInterval(() => {
      CryptoRateService.refreshAll().catch((error) => logger.error("Crypto rate refresh failed", { error: error instanceof Error ? error.message : String(error) }));
    }, 5 * 60_000);

    await bot.launch();
    logger.info("Bot is running");
  } catch (error) {
    logger.error("Failed to start bot", { error: error instanceof Error ? error.message : String(error) });
    process.exit(1);
  }
}

bootstrap();

async function shutdown(signal: string) {
  logger.info(`Stopping bot: ${signal}`);
  bot.stop(signal);
  await prisma.$disconnect();
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
