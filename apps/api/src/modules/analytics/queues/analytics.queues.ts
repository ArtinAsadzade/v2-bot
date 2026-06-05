import type { AnalyticsMetricKey } from '@prisma/client';

import { createQueue } from '../../../infrastructure/queue/queue-factory.js';

export type AnalyticsIncrementJob = {
  metric: AnalyticsMetricKey;
  delta: number;
};

export type AnalyticsAggregateJob = { bucketDate?: string };

export const analyticsQueue = createQueue<AnalyticsIncrementJob | AnalyticsAggregateJob>(
  'analytics-aggregation',
);

export const enqueueAnalyticsIncrement = async (
  metric: AnalyticsMetricKey,
  delta: number,
): Promise<void> => {
  await analyticsQueue.add('increment', { metric, delta }, { jobId: `analytics:${metric}:${Date.now()}` });
};

export const enqueueAnalyticsAggregate = async (bucketDate?: string): Promise<void> => {
  await analyticsQueue.add(
    'aggregate-day',
    bucketDate !== undefined ? { bucketDate } : {},
    { jobId: `analytics:aggregate:${bucketDate ?? 'today'}` },
  );
};
