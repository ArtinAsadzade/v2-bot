"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const bot_1 = require("./bot/bot");
const logger_1 = require("./services/logger");
require("./bot/handlers/start");
require("./bot/handlers/wallet");
require("./bot/handlers/deposit/start");
require("./bot/handlers/deposit/create");
require("./bot/handlers/deposit/receipt");
require("./bot/handlers/admin/deposit.admin");
require("./bot/handlers/support/start");
require("./bot/handlers/support/messages");
require("./bot/handlers/admin/support.admin");
require("./bot/handlers/coupon/apply");
require("./bot/handlers/admin/panel");
require("./bot/handlers/admin/coupon.admin");
async function bootstrap() {
    try {
        logger_1.logger.info("Bot starting...");
        await bot_1.bot.launch();
        logger_1.logger.info("Bot is running");
    }
    catch (error) {
        logger_1.logger.error("Failed to start bot");
        console.error(error);
        process.exit(1);
    }
}
bootstrap();
process.once("SIGINT", () => bot_1.bot.stop("SIGINT"));
process.once("SIGTERM", () => bot_1.bot.stop("SIGTERM"));
