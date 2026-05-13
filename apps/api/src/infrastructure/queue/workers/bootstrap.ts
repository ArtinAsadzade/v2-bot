import { Worker } from 'bullmq';

import { createFinanceWorkers } from '../../../modules/finance/queues/payment.workers.js';
import { config } from '../../../config/index.js';
import { logger } from '../../../core/logger/logger.js';
import { createRedisConnection } from '../../redis/client.js';

export const bootstrapWorkers = (): Worker[] => {
  const workers = createFinanceWorkers();
  logger.info({ workerCount: workers.length }, 'Queue worker bootstrap initialized');
  return workers;
};

export const createWorker = <T>(queueName: string, processor: (job: T) => Promise<void>): Worker =>
  new Worker(queueName, async (job) => processor(job.data as T), {
    connection: createRedisConnection(),
    prefix: config.queue.prefix,
  });
