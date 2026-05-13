import { logger } from './core/logger.js';
import { createBot } from './loaders/bot.loader.js';

const bot = createBot();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

await bot.launch();
logger.info('Telegram bot foundation started');
