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
const accountExpiration_1 = require("./jobs/accountExpiration");
const logger_1 = require("./services/logger");
const system_service_1 = require("./modules/system/system.service");
const prisma_1 = require("./services/prisma");
async function bootstrap() {
    try {
        logger_1.logger.info("Bot starting...");
        (0, handlers_1.registerHandlers)(bot_1.bot);
        await system_service_1.CryptoRateService.refreshAll().catch((error) => logger_1.logger.error("Initial crypto rate refresh failed", { error: error instanceof Error ? error.message : String(error) }));
        await (0, depositCleaner_1.cleanExpiredDeposits)().catch((error) => logger_1.logger.error("Initial deposit cleaner failed", { error: error instanceof Error ? error.message : String(error) }));
        await (0, accountExpiration_1.deactivateExpiredAccounts)().catch((error) => logger_1.logger.error("Initial account expiration job failed", { error: error instanceof Error ? error.message : String(error) }));
        setInterval(() => {
            (0, depositCleaner_1.cleanExpiredDeposits)().catch((error) => logger_1.logger.error("Deposit cleaner failed", { error: error instanceof Error ? error.message : String(error) }));
            (0, accountExpiration_1.deactivateExpiredAccounts)().catch((error) => logger_1.logger.error("Account expiration job failed", { error: error instanceof Error ? error.message : String(error) }));
        }, 60000);
        setInterval(() => {
            system_service_1.CryptoRateService.refreshAll().catch((error) => logger_1.logger.error("Crypto rate refresh failed", { error: error instanceof Error ? error.message : String(error) }));
        }, 5 * 60000);
        await bot_1.bot.launch();
        logger_1.logger.info("Bot is running");
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
