import { env } from './config/env.js';
import { createBot } from './infrastructure/telegram/bot.js';
import { startWorkers } from './infrastructure/queue/queues.js';
import { buildServer } from './presentation/http/server.js';
import { logger } from './shared/logger.js';

const bootstrap = async () => {
  const server = await buildServer();
  startWorkers();

  const bot = createBot();
  await bot.launch();

  await server.listen({ port: env.API_PORT, host: '0.0.0.0' });
  logger.info({ port: env.API_PORT }, 'API and Telegram bot started');

  const shutdown = async () => {
    logger.info('shutting down');
    bot.stop();
    await server.close();
    process.exit(0);
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
};

bootstrap().catch((error) => {
  logger.fatal(error);
  process.exit(1);
});
