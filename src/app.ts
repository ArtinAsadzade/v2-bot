import dotenv from "dotenv";

dotenv.config();

import { bot } from "./bot/bot";
import { registerHandlers } from "./bot/handlers";
import { cleanExpiredDeposits } from "./jobs/depositCleaner";
import { cleanStalePurchases } from "./jobs/purchaseCleaner";
import { deactivateExpiredAccounts } from "./jobs/accountExpiration";
import { cleanupExpiredDeliveryReservations } from "./jobs/deliveryCleanup";
import { logger } from "./services/logger";
import { CryptoRateService } from "./modules/system/system.service";
import { prisma } from "./services/prisma";
import { startPaymentCallbackServer } from "./services/payment-callback-server";
import { MonitoringService } from "./services/monitoring.service";
import { runJobOnce } from "./jobs/runJobOnce";

async function bootstrap() {
  try {
    logger.info("Bot starting...");
    registerHandlers(bot);

    await runJobOnce("crypto-rate-refresh", () => CryptoRateService.refreshAll()).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("Initial crypto rate refresh failed", { error: message });
      MonitoringService.record({
        type: "CRYPTO_RATE_FAILED",
        section: "Crypto Rate",
        description: message,
        severity: "critical",
        suggestedAction: "اتصال Coingecko و نرخ USD_TOMAN_RATE را بررسی کنید.",
      });
    });
    await runJobOnce("deposit-cleaner", () => cleanExpiredDeposits()).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("Initial deposit cleaner failed", { error: message });
      MonitoringService.record({
        type: "JOB_FAILED",
        section: "Deposit Cleaner",
        description: message,
        severity: "critical",
        suggestedAction: "لاگ job و اتصال دیتابیس را بررسی کنید.",
      });
    });
    await runJobOnce("purchase-cleaner", () => cleanStalePurchases()).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("Initial purchase cleaner failed", { error: message });
      MonitoringService.record({ type: "JOB_FAILED", section: "Purchase Cleaner", description: message, severity: "critical", suggestedAction: "لاگ job و اتصال دیتابیس را بررسی کنید." });
    });
    await runJobOnce("account-expiration", () => deactivateExpiredAccounts()).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("Initial account expiration job failed", { error: message });
      MonitoringService.record({
        type: "JOB_FAILED",
        section: "Account Expiration",
        description: message,
        severity: "critical",
        suggestedAction: "لاگ job و اتصال دیتابیس را بررسی کنید.",
      });
    });
    await runJobOnce("delivery-cleanup", () => cleanupExpiredDeliveryReservations()).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("Initial delivery cleanup job failed", { error: message });
      MonitoringService.record({ type: "JOB_FAILED", section: "Delivery Cleanup", description: message, severity: "critical", suggestedAction: "لاگ job و اتصال دیتابیس را بررسی کنید." });
    });
    setInterval(() => {
      runJobOnce("deposit-cleaner", () => cleanExpiredDeposits()).catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        logger.error("Deposit cleaner failed", { error: message });
        MonitoringService.record({
          type: "JOB_FAILED",
          section: "Deposit Cleaner",
          description: message,
          severity: "critical",
          suggestedAction: "لاگ job و اتصال دیتابیس را بررسی کنید.",
        });
      });
      runJobOnce("purchase-cleaner", () => cleanStalePurchases()).catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        logger.error("Purchase cleaner failed", { error: message });
        MonitoringService.record({ type: "JOB_FAILED", section: "Purchase Cleaner", description: message, severity: "critical", suggestedAction: "لاگ job و اتصال دیتابیس را بررسی کنید." });
      });
      runJobOnce("account-expiration", () => deactivateExpiredAccounts()).catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        logger.error("Account expiration job failed", { error: message });
        MonitoringService.record({
          type: "JOB_FAILED",
          section: "Account Expiration",
          description: message,
          severity: "critical",
          suggestedAction: "لاگ job و اتصال دیتابیس را بررسی کنید.",
        });
      });
      runJobOnce("delivery-cleanup", () => cleanupExpiredDeliveryReservations()).catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        logger.error("Delivery cleanup job failed", { error: message });
        MonitoringService.record({ type: "JOB_FAILED", section: "Delivery Cleanup", description: message, severity: "critical", suggestedAction: "لاگ job و اتصال دیتابیس را بررسی کنید." });
      });
    }, 60_000);
    setInterval(() => {
      runJobOnce("crypto-rate-refresh", () => CryptoRateService.refreshAll()).catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        logger.error("Crypto rate refresh failed", { error: message });
        MonitoringService.record({
          type: "CRYPTO_RATE_FAILED",
          section: "Crypto Rate",
          description: message,
          severity: "critical",
          suggestedAction: "اتصال Coingecko و نرخ USD_TOMAN_RATE را بررسی کنید.",
        });
      });
    }, 5 * 60_000);

    const paymentServer = startPaymentCallbackServer(bot);
    await bot.launch({ allowedUpdates: ["message", "callback_query"] });
    logger.info("Bot is running");
    process.once("SIGINT", () => paymentServer.close());
    process.once("SIGTERM", () => paymentServer.close());
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
