import { botConfig } from './config/env.js';
import { logger } from './core/logger.js';
import { createBot } from './loaders/bot.loader.js';

const bot = createBot();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

try {
  await bot.launch();
  logger.info(
    {
      username: bot.botInfo?.username,
      apiBaseUrl: botConfig.API_BASE_URL,
      mode: 'polling',
    },
    'Telegram bot started',
  );
} catch (error) {
  logger.error({ error }, 'Failed to start Telegram bot');
  process.exit(1);
}
