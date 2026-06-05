import { createQueue } from '../../../infrastructure/queue/queue-factory.js';

export type ReferralRewardJob = {
  referrerId: string;
  refereeId: string;
  baseAmountToman: string;
  idempotencyKey: string;
  sourceTransactionId?: string;
};

export const referralRewardQueue = createQueue<ReferralRewardJob>('referral-rewards');

export const enqueueReferralReward = async (job: ReferralRewardJob): Promise<void> => {
  await referralRewardQueue.add('process-reward', job, {
    jobId: `referral-reward:${job.idempotencyKey}`,
  });
};
