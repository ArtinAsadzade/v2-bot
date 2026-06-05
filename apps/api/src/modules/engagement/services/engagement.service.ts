import { UserActivityType } from '@prisma/client';

import type { PrismaClient } from '@prisma/client';

const LEVEL_THRESHOLDS = [0, 50, 150, 400, 1000];

export class EngagementService {
  public constructor(private readonly prisma: PrismaClient) {}

  public async recordDailyLogin(userId: string): Promise<void> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const score = await this.prisma.engagementScore.upsert({
      where: { userId },
      update: {},
      create: { userId },
    });
    const lastLogin = score.lastLoginAt;
    let streakDays = score.streakDays;
    if (!lastLogin || lastLogin < today) {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      streakDays =
        lastLogin && lastLogin >= yesterday && lastLogin < today ? streakDays + 1 : 1;
      await this.logActivity(userId, UserActivityType.DAILY_LOGIN, 10);
      await this.prisma.engagementScore.update({
        where: { userId },
        data: { lastLoginAt: new Date(), lastStreakAt: new Date(), streakDays },
      });
    }
  }

  public async logActivity(
    userId: string,
    activity: UserActivityType,
    scoreDelta = 0,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.userActivityLog.create({
      data: { userId, activity, scoreDelta, metadata: metadata as never },
    });
    if (scoreDelta > 0) {
      const updated = await this.prisma.engagementScore.upsert({
        where: { userId },
        update: { activityScore: { increment: scoreDelta } },
        create: { userId, activityScore: scoreDelta },
      });
      const level = this.computeLevel(updated.activityScore);
      if (level !== updated.level) {
        await this.prisma.engagementScore.update({
          where: { userId },
          data: { level, rewardPlaceholder: { levelUp: level } as never },
        });
      }
    }
  }

  public async getProfile(userId: string) {
    const score = await this.prisma.engagementScore.findUnique({ where: { userId } });
    return {
      activityScore: score?.activityScore ?? 0,
      level: score?.level ?? 1,
      streakDays: score?.streakDays ?? 0,
      lastLoginAt: score?.lastLoginAt?.toISOString() ?? null,
      rewardPlaceholder: score?.rewardPlaceholder ?? null,
    };
  }

  private computeLevel(activityScore: number): number {
    let level = 1;
    for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i -= 1) {
      if (activityScore >= LEVEL_THRESHOLDS[i]!) level = i + 1;
    }
    return Math.min(level, LEVEL_THRESHOLDS.length);
  }
}
