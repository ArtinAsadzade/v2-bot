import { Worker } from 'bullmq';

import { config } from '../../../config/index.js';
import { logger } from '../../../core/logger/logger.js';
import { createRedisConnection } from '../../redis/client.js';

export const bootstrapWorkers = (): Worker[] => {
  logger.info('Queue worker bootstrap initialized without registered business jobs');
  return [];
};

export const createWorker = <T>(queueName: string, processor: (job: T) => Promise<void>): Worker =>
  new Worker(queueName, async (job) => processor(job.data as T), {
    connection: createRedisConnection(),
    prefix: config.queue.prefix,
  });
