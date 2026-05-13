import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { env } from '../../config/env.js';
import { logger } from '../../shared/logger.js';

export const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });

export const notificationQueue = new Queue('notifications', { connection });
export const trafficSyncQueue = new Queue('traffic-sync', { connection });

export const startWorkers = () => {
  new Worker(
    'notifications',
    async (job) => {
      logger.info({ jobId: job.id, data: job.data }, 'notification job processed');
    },
    { connection },
  );

  new Worker(
    'traffic-sync',
    async (job) => {
      logger.info({ jobId: job.id, data: job.data }, 'traffic sync job processed');
    },
    { connection },
  );
};
