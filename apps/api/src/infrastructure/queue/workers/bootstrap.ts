import { Worker } from 'bullmq';

import { createAnalyticsWorkers } from '../../../modules/analytics/queues/analytics.workers.js';
import { createFinanceWorkers } from '../../../modules/finance/queues/payment.workers.js';
import { createLifecycleWorkers } from '../../../modules/lifecycle/queues/lifecycle.workers.js';
import { createNotificationWorkers } from '../../../modules/notifications/queues/notification.workers.js';
import { createReferralWorkers } from '../../../modules/referrals/queues/referral.workers.js';
import { createXrayWorkers } from '../../../modules/provisioning/queues/xray.workers.js';
import { createTicketWorkers } from '../../../modules/support/queues/ticket.workers.js';
import { config } from '../../../config/index.js';
import { logger } from '../../../core/logger/logger.js';
import { createBullmqConnection } from '../../redis/client.js';

export const bootstrapWorkers = (): Worker[] => {
  const workers = [
    ...createFinanceWorkers(),
    ...createXrayWorkers(),
    ...createNotificationWorkers(),
    ...createReferralWorkers(),
    ...createAnalyticsWorkers(),
    ...createLifecycleWorkers(),
    ...createTicketWorkers(),
  ];
  logger.info({ workerCount: workers.length }, 'Queue worker bootstrap initialized');
  return workers;
};

export const createWorker = <T>(queueName: string, processor: (job: T) => Promise<void>): Worker =>
  new Worker(queueName, async (job) => processor(job.data as T), {
    connection: createBullmqConnection(),
    prefix: config.queue.prefix,
  });
