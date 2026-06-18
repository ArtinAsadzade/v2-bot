"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const bot_1 = require("./bot/bot");
const handlers_1 = require("./bot/handlers");
const depositCleaner_1 = require("./jobs/depositCleaner");
const purchaseCleaner_1 = require("./jobs/purchaseCleaner");
const accountExpiration_1 = require("./jobs/accountExpiration");
const logger_1 = require("./services/logger");
const system_service_1 = require("./modules/system/system.service");
const prisma_1 = require("./services/prisma");
const payment_callback_server_1 = require("./services/payment-callback-server");
const monitoring_service_1 = require("./services/monitoring.service");
async function bootstrap() {
    try {
        logger_1.logger.info("Bot starting...");
        (0, handlers_1.registerHandlers)(bot_1.bot);
        await system_service_1.CryptoRateService.refreshAll().catch((error) => {
            const message = error instanceof Error ? error.message : String(error);
            logger_1.logger.error("Initial crypto rate refresh failed", { error: message });
            monitoring_service_1.MonitoringService.record({
                type: "CRYPTO_RATE_FAILED",
                section: "Crypto Rate",
                description: message,
                severity: "critical",
                suggestedAction: "اتصال Coingecko و نرخ USD_TOMAN_RATE را بررسی کنید.",
            });
        });
        await (0, depositCleaner_1.cleanExpiredDeposits)().catch((error) => {
            const message = error instanceof Error ? error.message : String(error);
            logger_1.logger.error("Initial deposit cleaner failed", { error: message });
            monitoring_service_1.MonitoringService.record({
                type: "JOB_FAILED",
                section: "Deposit Cleaner",
                description: message,
                severity: "critical",
                suggestedAction: "لاگ job و اتصال دیتابیس را بررسی کنید.",
            });
        });
        await (0, purchaseCleaner_1.cleanStalePurchases)().catch((error) => {
            const message = error instanceof Error ? error.message : String(error);
            logger_1.logger.error("Initial purchase cleaner failed", { error: message });
            monitoring_service_1.MonitoringService.record({ type: "JOB_FAILED", section: "Purchase Cleaner", description: message, severity: "critical", suggestedAction: "لاگ job و اتصال دیتابیس را بررسی کنید." });
        });
        await (0, accountExpiration_1.deactivateExpiredAccounts)().catch((error) => {
            const message = error instanceof Error ? error.message : String(error);
            logger_1.logger.error("Initial account expiration job failed", { error: message });
            monitoring_service_1.MonitoringService.record({
                type: "JOB_FAILED",
                section: "Account Expiration",
                description: message,
                severity: "critical",
                suggestedAction: "لاگ job و اتصال دیتابیس را بررسی کنید.",
            });
        });
        setInterval(() => {
            (0, depositCleaner_1.cleanExpiredDeposits)().catch((error) => {
                const message = error instanceof Error ? error.message : String(error);
                logger_1.logger.error("Deposit cleaner failed", { error: message });
                monitoring_service_1.MonitoringService.record({
                    type: "JOB_FAILED",
                    section: "Deposit Cleaner",
                    description: message,
                    severity: "critical",
                    suggestedAction: "لاگ job و اتصال دیتابیس را بررسی کنید.",
                });
            });
            (0, purchaseCleaner_1.cleanStalePurchases)().catch((error) => {
                const message = error instanceof Error ? error.message : String(error);
                logger_1.logger.error("Purchase cleaner failed", { error: message });
                monitoring_service_1.MonitoringService.record({ type: "JOB_FAILED", section: "Purchase Cleaner", description: message, severity: "critical", suggestedAction: "لاگ job و اتصال دیتابیس را بررسی کنید." });
            });
            (0, accountExpiration_1.deactivateExpiredAccounts)().catch((error) => {
                const message = error instanceof Error ? error.message : String(error);
                logger_1.logger.error("Account expiration job failed", { error: message });
                monitoring_service_1.MonitoringService.record({
                    type: "JOB_FAILED",
                    section: "Account Expiration",
                    description: message,
                    severity: "critical",
                    suggestedAction: "لاگ job و اتصال دیتابیس را بررسی کنید.",
                });
            });
        }, 60000);
        setInterval(() => {
            system_service_1.CryptoRateService.refreshAll().catch((error) => {
                const message = error instanceof Error ? error.message : String(error);
                logger_1.logger.error("Crypto rate refresh failed", { error: message });
                monitoring_service_1.MonitoringService.record({
                    type: "CRYPTO_RATE_FAILED",
                    section: "Crypto Rate",
                    description: message,
                    severity: "critical",
                    suggestedAction: "اتصال Coingecko و نرخ USD_TOMAN_RATE را بررسی کنید.",
                });
            });
        }, 5 * 60000);
        const paymentServer = (0, payment_callback_server_1.startPaymentCallbackServer)(bot_1.bot);
        await bot_1.bot.launch({ allowedUpdates: ["message", "callback_query"] });
        logger_1.logger.info("Bot is running");
        process.once("SIGINT", () => paymentServer.close());
        process.once("SIGTERM", () => paymentServer.close());
    }
    catch (error) {
        logger_1.logger.error("Failed to start bot", { error: error instanceof Error ? error.message : String(error) });
        process.exit(1);
    }
}
bootstrap();
async function shutdown(signal) {
    logger_1.logger.info(`Stopping bot: ${signal}`);
    bot_1.bot.stop(signal);
    await prisma_1.prisma.$disconnect();
}
process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
