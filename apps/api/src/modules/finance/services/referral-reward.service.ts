import {
  AuditActorType,
  ReferralRewardStatus,
  WalletTransactionDirection,
  WalletTransactionType,
} from '@prisma/client';

import { multiplyByBps } from './money.js';
import { WalletService } from './wallet.service.js';

import type { PrismaClient } from '@prisma/client';

const DEFAULT_REFERRAL_BPS = 500;

export class ReferralRewardService {
  public constructor(private readonly prisma: PrismaClient) {}

  public async applyReward(input: {
    referrerId: string;
    refereeId: string;
    baseAmountToman: bigint;
    sourceTransactionId?: string | undefined;
    percentageBps?: number;
    idempotencyKey: string;
  }) {
    const existing = await this.prisma.referralReward.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) return existing;
    const percentageBps = input.percentageBps ?? DEFAULT_REFERRAL_BPS;
    const rewardAmountToman = multiplyByBps(input.baseAmountToman, percentageBps);
    const ledger = await new WalletService(this.prisma).applyLedger({
      userId: input.referrerId,
      amountToman: rewardAmountToman,
      type: WalletTransactionType.REFERRAL_REWARD,
      direction: WalletTransactionDirection.CREDIT,
      reason: 'Referral cashback reward',
      idempotencyKey: `referral-ledger:${input.idempotencyKey}`,
      referenceId: input.sourceTransactionId,
      actorType: AuditActorType.SYSTEM,
    });
    return this.prisma.referralReward.create({
      data: {
        referrerId: input.referrerId,
        refereeId: input.refereeId,
        sourceTransactionId: input.sourceTransactionId,
        rewardTransactionId: ledger.id,
        percentageBps,
        baseAmountToman: input.baseAmountToman,
        rewardAmountToman,
        status: ReferralRewardStatus.COMPLETED,
        idempotencyKey: input.idempotencyKey,
      } as never,
    });
  }
}
