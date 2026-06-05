import { NotificationType, ReferralRewardStatus, ReferralStatus } from '@prisma/client';

import { config } from '../../../config/index.js';
import { ReferralRewardService } from '../../finance/services/referral-reward.service.js';
import { NotificationService } from '../../notifications/services/notification.service.js';

import type { PrismaClient } from '@prisma/client';
import type { ReferralRewardJob } from '../queues/referral.queues.js';

/**
 * Configurable referral rewards: cashback %, fixed bonus, delayed release.
 * Ledger entries only — no external payment processing.
 */
export class ReferralRewardEngineService {
  public constructor(private readonly prisma: PrismaClient) {}

  public async processReward(job: ReferralRewardJob): Promise<void> {
    const releaseAt =
      config.engagement.referralRewardDelayHours > 0
        ? new Date(Date.now() + config.engagement.referralRewardDelayHours * 3_600_000)
        : null;
    if (releaseAt && releaseAt > new Date()) {
      await this.prisma.referralReward.upsert({
        where: { idempotencyKey: job.idempotencyKey },
        update: {},
        create: {
          referrerId: job.referrerId,
          refereeId: job.refereeId,
          percentageBps: config.engagement.referralCashbackBps,
          fixedBonusToman: config.engagement.referralFixedBonusToman,
          baseAmountToman: BigInt(job.baseAmountToman),
          rewardAmountToman: 0n,
          status: ReferralRewardStatus.PENDING,
          releaseAt,
          idempotencyKey: job.idempotencyKey,
        },
      });
      return;
    }

    const base = BigInt(job.baseAmountToman);
    const reward = await new ReferralRewardService(this.prisma).applyReward({
      referrerId: job.referrerId,
      refereeId: job.refereeId,
      baseAmountToman: base,
      sourceTransactionId: job.sourceTransactionId,
      percentageBps: config.engagement.referralCashbackBps,
      idempotencyKey: job.idempotencyKey,
    });

    const fixedBonus = config.engagement.referralFixedBonusToman;
    if (fixedBonus > 0n) {
      await new ReferralRewardService(this.prisma).applyReward({
        referrerId: job.referrerId,
        refereeId: job.refereeId,
        baseAmountToman: fixedBonus,
        percentageBps: 10_000,
        idempotencyKey: `${job.idempotencyKey}:fixed`,
      });
    }

    await this.prisma.referral.updateMany({
      where: { referrerId: job.referrerId, refereeId: job.refereeId },
      data: { status: ReferralStatus.REWARDED, rewardToman: reward.rewardAmountToman + fixedBonus },
    });

    await new NotificationService(this.prisma).schedule({
      userId: job.referrerId,
      type: NotificationType.REFERRAL_REWARD,
      templateKey: 'referral_reward',
      deduplicationKey: `referral-reward:${job.idempotencyKey}`,
      variables: { amountToman: reward.rewardAmountToman.toString() },
    });
  }
}
