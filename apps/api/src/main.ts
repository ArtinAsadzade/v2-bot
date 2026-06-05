import { config } from './config/index.js';
import { logger } from './core/logger/logger.js';
import { registerEventHandlers } from './infrastructure/events/register-handlers.js';
import { bootstrapSchedulers } from './infrastructure/queue/schedulers/bootstrap.js';
import { bootstrapWorkers } from './infrastructure/queue/workers/bootstrap.js';
import { buildApp } from './app.js';

registerEventHandlers();
const app = await buildApp();
const workers = bootstrapWorkers();
bootstrapSchedulers();

const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
  logger.info({ signal }, 'Graceful shutdown started');
  await Promise.all(workers.map((worker) => worker.close()));
  await app.close();
  logger.info('Graceful shutdown completed');
};

process.on('SIGTERM', (signal) => void shutdown(signal));
process.on('SIGINT', (signal) => void shutdown(signal));

await app.listen({ host: config.api.host, port: config.api.port });
