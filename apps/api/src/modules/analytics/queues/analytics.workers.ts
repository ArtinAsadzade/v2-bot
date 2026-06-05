import { Worker, type Job } from 'bullmq';

import { config } from '../../../config/index.js';
import { createBullmqConnection } from '../../../infrastructure/redis/client.js';
import { prisma } from '../../../infrastructure/prisma/client.js';
import { AnalyticsService } from '../services/analytics.service.js';

import type { AnalyticsAggregateJob, AnalyticsIncrementJob } from './analytics.queues.js';

export const createAnalyticsWorkers = (): Worker[] => {
  const analytics = new AnalyticsService(prisma);
  const processor = async (
    job: Job<AnalyticsIncrementJob | AnalyticsAggregateJob>,
  ): Promise<void> => {
    if (job.name === 'increment') {
      const data = job.data as AnalyticsIncrementJob;
      await analytics.increment(data.metric as never, data.delta);
      return;
    }
    if (job.name === 'aggregate-day') {
      const data = job.data as AnalyticsAggregateJob;
      await analytics.aggregateDay(data.bucketDate ? new Date(data.bucketDate) : new Date());
    }
  };
  return [
    new Worker('analytics-aggregation', processor, {
      connection: createBullmqConnection(),
      prefix: config.queue.prefix,
    }),
  ];
};
