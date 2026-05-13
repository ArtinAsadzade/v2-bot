import { Queue, type JobsOptions, type QueueOptions } from 'bullmq';

import { config } from '../../config/index.js';
import { createRedisConnection } from '../redis/client.js';

export type QueueName = 'notifications' | 'xray-sync' | 'audit';

const defaultJobOptions: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5_000 },
  removeOnComplete: { count: 1_000 },
  removeOnFail: { count: 5_000 },
};

export const createQueue = <T = unknown>(name: QueueName, options?: QueueOptions): Queue<T> =>
  new Queue<T>(name, {
    connection: createRedisConnection(),
    prefix: config.queue.prefix,
    defaultJobOptions,
    ...options,
  });
