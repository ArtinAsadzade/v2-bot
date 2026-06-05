import { Worker, type Job } from 'bullmq';

import { config } from '../../../config/index.js';
import { logger } from '../../../core/logger/logger.js';
import { createBullmqConnection } from '../../../infrastructure/redis/client.js';
import { prisma } from '../../../infrastructure/prisma/client.js';
import { ReferralRewardEngineService } from '../services/referral-reward-engine.service.js';

import type { ReferralRewardJob } from './referral.queues.js';

export const createReferralWorkers = (): Worker[] => {
  const engine = new ReferralRewardEngineService(prisma);
  const processor = async (job: Job<ReferralRewardJob>): Promise<void> => {
    if (job.name === 'release-pending') {
      const pending = await prisma.referralReward.findMany({
        where: {
          status: 'PENDING',
          releaseAt: { lte: new Date() },
        },
        take: 50,
      });
      for (const row of pending) {
        await engine.processReward({
          referrerId: row.referrerId,
          refereeId: row.refereeId,
          baseAmountToman: row.baseAmountToman.toString(),
          idempotencyKey: row.idempotencyKey,
          ...(row.sourceTransactionId !== null ? { sourceTransactionId: row.sourceTransactionId } : {}),
        });
      }
      return;
    }
    if (job.name !== 'process-reward') return;
    await engine.processReward(job.data);
    logger.info({ idempotencyKey: job.data.idempotencyKey }, 'referral reward processed');
  };
  return [
    new Worker<ReferralRewardJob>('referral-rewards', processor, {
      connection: createBullmqConnection(),
      prefix: config.queue.prefix,
    }),
  ];
};
