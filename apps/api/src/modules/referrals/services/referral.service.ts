import { ReferralAttributionSource, ReferralStatus } from '@prisma/client';
import { SystemEventType } from '@prisma/client';

import { eventBus } from '../../../infrastructure/events/event-bus.js';
import { ReferralAbuseService } from './referral-abuse.service.js';

import type { PrismaClient } from '@prisma/client';

export type ReferralStats = {
  referralCode: string;
  inviteLink: string;
  totalInvites: number;
  rewardedCount: number;
  pendingCount: number;
  totalRewardToman: string;
  history: Array<{
    refereeId: string;
    status: ReferralStatus;
    rewardToman: string;
    source: ReferralAttributionSource;
    createdAt: string;
  }>;
};

export class ReferralService {
  private readonly abuse = new ReferralAbuseService(this.prisma);

  public constructor(private readonly prisma: PrismaClient) {}

  public buildInviteLink(botUsername: string, referralCode: string): string {
    return `https://t.me/${botUsername}?start=${referralCode}`;
  }

  public async getStats(userId: string, botUsername: string): Promise<ReferralStats> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { referralCode: true },
    });
    const referrals = await this.prisma.referral.findMany({
      where: { referrerId: userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    const rewards = await this.prisma.referralReward.aggregate({
      where: { referrerId: userId, status: 'COMPLETED' },
      _sum: { rewardAmountToman: true },
    });
    return {
      referralCode: user.referralCode,
      inviteLink: this.buildInviteLink(botUsername, user.referralCode),
      totalInvites: referrals.length,
      rewardedCount: referrals.filter((r) => r.status === ReferralStatus.REWARDED).length,
      pendingCount: referrals.filter((r) => r.status === ReferralStatus.PENDING).length,
      totalRewardToman: (rewards._sum.rewardAmountToman ?? 0n).toString(),
      history: referrals.map((r) => ({
        refereeId: r.refereeId,
        status: r.status,
        rewardToman: r.rewardToman.toString(),
        source: r.source,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }

  public async recordAttribution(input: {
    inviterId: string;
    invitedId: string;
    source: ReferralAttributionSource;
    inviterTelegramId: string;
    invitedTelegramId: string;
  }): Promise<void> {
    if (this.abuse.isSelfReferral(input.inviterTelegramId, input.invitedTelegramId)) return;
    const allowed = await this.abuse.canAcceptReferral(input.inviterId, input.invitedTelegramId);
    if (!allowed) return;

    await this.prisma.referralAttributionLog.upsert({
      where: { inviterId_invitedId: { inviterId: input.inviterId, invitedId: input.invitedId } },
      update: {},
      create: {
        inviterId: input.inviterId,
        invitedId: input.invitedId,
        source: input.source,
        metadata: { telegramId: input.invitedTelegramId },
      },
    });

    await this.prisma.referral.upsert({
      where: { referrerId_refereeId: { referrerId: input.inviterId, refereeId: input.invitedId } },
      update: {},
      create: {
        referrerId: input.inviterId,
        refereeId: input.invitedId,
        source: input.source,
        status: ReferralStatus.PENDING,
      },
    });

    await eventBus.emit({
      type: SystemEventType.REFERRAL_ACTIVATED,
      idempotencyKey: `referral-activated:${input.inviterId}:${input.invitedId}`,
      aggregateType: 'referral',
      aggregateId: input.invitedId,
      payload: { referrerId: input.inviterId, refereeId: input.invitedId, source: input.source },
    });
  }
}
