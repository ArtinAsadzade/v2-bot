import { AnalyticsMetricKey } from '@prisma/client';

import type { PrismaClient } from '@prisma/client';

export class AnalyticsService {
  public constructor(private readonly prisma: PrismaClient) {}

  public async increment(metric: AnalyticsMetricKey, delta = 1, date = new Date()): Promise<void> {
    const bucketDate = new Date(date);
    bucketDate.setHours(0, 0, 0, 0);
    await this.prisma.analyticsDaily.upsert({
      where: { bucketDate_metric: { bucketDate, metric } },
      update: { value: { increment: BigInt(delta) } },
      create: { bucketDate, metric, value: BigInt(delta) },
    });
  }

  public async getDaily(bucketDate?: Date) {
    const date = bucketDate ?? new Date();
    date.setHours(0, 0, 0, 0);
    const rows = await this.prisma.analyticsDaily.findMany({
      where: { bucketDate: date },
    });
    return rows.map((r) => ({
      metric: r.metric,
      value: r.value.toString(),
      bucketDate: r.bucketDate.toISOString().slice(0, 10),
    }));
  }

  public async aggregateDay(date = new Date()): Promise<void> {
    const bucketDate = new Date(date);
    bucketDate.setHours(0, 0, 0, 0);
    const dayStart = bucketDate;
    const dayEnd = new Date(bucketDate);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const [purchases, referrals, tickets, notifications, activeUsers] = await Promise.all([
      this.prisma.purchase.count({
        where: { createdAt: { gte: dayStart, lt: dayEnd }, status: 'SUCCEEDED' },
      }),
      this.prisma.referral.count({ where: { createdAt: { gte: dayStart, lt: dayEnd } } }),
      this.prisma.supportTicket.count({
        where: { createdAt: { gte: dayStart, lt: dayEnd }, deletedAt: null },
      }),
      this.prisma.notification.count({
        where: { sentAt: { gte: dayStart, lt: dayEnd }, status: 'SENT' },
      }),
      this.prisma.userActivityLog.groupBy({
        by: ['userId'],
        where: { createdAt: { gte: dayStart, lt: dayEnd } },
      }),
    ]);

    await Promise.all([
      this.increment(AnalyticsMetricKey.PURCHASES, purchases, bucketDate),
      this.increment(AnalyticsMetricKey.REFERRAL_CONVERSIONS, referrals, bucketDate),
      this.increment(AnalyticsMetricKey.TICKETS_CREATED, tickets, bucketDate),
      this.increment(AnalyticsMetricKey.NOTIFICATIONS_SENT, notifications, bucketDate),
      this.increment(AnalyticsMetricKey.ACTIVE_USERS, activeUsers.length, bucketDate),
    ]);
  }
}
