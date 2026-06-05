import { logger } from '../../../core/logger/logger.js';
import { enqueueAnalyticsAggregate } from '../../../modules/analytics/queues/analytics.queues.js';
import { referralRewardQueue } from '../../../modules/referrals/queues/referral.queues.js';
import { lifecycleQueue } from '../../../modules/lifecycle/queues/lifecycle.queues.js';
import {
  expirationCheckQueue,
  trafficSyncQueue,
} from '../../../modules/provisioning/queues/provisioning.queues.js';
import { prisma } from '../../prisma/client.js';

export const bootstrapSchedulers = (): void => {
  void scheduleRecurringJobs();
  logger.info('Queue scheduler bootstrap initialized');
};

const scheduleRecurringJobs = async (): Promise<void> => {
  await expirationCheckQueue.add(
    'expiration-check',
    { batchSize: 100 },
    { repeat: { every: 300_000 }, jobId: 'scheduler:expiration-check' },
  );

  const activeServices = await prisma.serviceInstance.findMany({
    where: { status: 'ACTIVE', deletedAt: null },
    select: { id: true },
    take: 200,
  });
  for (const service of activeServices) {
    await trafficSyncQueue.add(
      'traffic-sync',
      { serviceInstanceId: service.id },
      {
        repeat: { every: 600_000 },
        jobId: `scheduler:traffic:${service.id}`,
      },
    );
  }

  await lifecycleQueue.add(
    'expiry-reminder',
    { kind: 'expiry-reminder', batchSize: 100 },
    { repeat: { every: 3_600_000 }, jobId: 'scheduler:lifecycle:expiry-reminder' },
  );
  await lifecycleQueue.add(
    'traffic-warning',
    { kind: 'traffic-warning', batchSize: 100 },
    { repeat: { every: 600_000 }, jobId: 'scheduler:lifecycle:traffic-warning' },
  );
  await lifecycleQueue.add(
    'expire-mark',
    { kind: 'expire-mark', batchSize: 100 },
    { repeat: { every: 300_000 }, jobId: 'scheduler:lifecycle:expire-mark' },
  );
  await lifecycleQueue.add(
    'inactivity',
    { kind: 'inactivity', batchSize: 50 },
    { repeat: { every: 86_400_000 }, jobId: 'scheduler:lifecycle:inactivity' },
  );
  await enqueueAnalyticsAggregate();
  await referralRewardQueue.add(
    'release-pending',
    { referrerId: '', refereeId: '', baseAmountToman: '0', idempotencyKey: 'scheduler' },
    { repeat: { every: 3_600_000 }, jobId: 'scheduler:referral-release-pending' },
  );
};
