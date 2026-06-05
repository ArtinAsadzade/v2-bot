import type { PrismaClient } from '@prisma/client';

const FARMING_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_REFERRALS_PER_DAY = 20;

/**
 * Basic multi-account farming heuristics for referral attribution.
 */
export class ReferralAbuseService {
  public constructor(private readonly prisma: PrismaClient) {}

  public async canAcceptReferral(referrerId: string, refereeTelegramId: string): Promise<boolean> {
    const referee = await this.prisma.user.findUnique({
      where: { telegramId: refereeTelegramId },
      select: { id: true, referredById: true },
    });
    if (referee?.referredById) return false;

    const since = new Date(Date.now() - FARMING_WINDOW_MS);
    const recentCount = await this.prisma.referral.count({
      where: { referrerId, createdAt: { gte: since } },
    });
    if (recentCount >= MAX_REFERRALS_PER_DAY) return false;

    return true;
  }

  public isSelfReferral(referrerTelegramId: string, refereeTelegramId: string): boolean {
    return referrerTelegramId === refereeTelegramId;
  }
}
