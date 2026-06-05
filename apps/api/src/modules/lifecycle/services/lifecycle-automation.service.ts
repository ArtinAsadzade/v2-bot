import { ServiceInstanceStatus, SystemEventType } from '@prisma/client';

import { config } from '../../../config/index.js';
import { eventBus } from '../../../infrastructure/events/event-bus.js';
import { NotificationService } from '../../notifications/services/notification.service.js';

import type { PrismaClient } from '@prisma/client';

const THREE_DAYS_MS = 3 * 86_400_000;
const ONE_DAY_MS = 86_400_000;

export class LifecycleAutomationService {
  public constructor(private readonly prisma: PrismaClient) {}

  public async scanExpiryReminders(batchSize = 100): Promise<number> {
    const now = Date.now();
    const graceMs = config.engagement.serviceGracePeriodHours * 3_600_000;
    const services = await this.prisma.serviceInstance.findMany({
      where: {
        status: { in: [ServiceInstanceStatus.ACTIVE, ServiceInstanceStatus.SUSPENDED] },
        deletedAt: null,
        expiresAt: { gt: new Date(now - graceMs) },
      },
      take: batchSize,
      include: { user: { select: { id: true } } },
    });

    const notifications = new NotificationService(this.prisma);
    let sent = 0;
    for (const service of services) {
      const remaining = service.expiresAt.getTime() - now;
      if (remaining <= THREE_DAYS_MS && remaining > ONE_DAY_MS) {
        await notifications.schedule({
          userId: service.userId,
          type: 'SERVICE_EXPIRING',
          templateKey: 'service_expiring_3d',
          deduplicationKey: `expiry-3d:${service.id}`,
          referenceType: 'service',
          referenceId: service.id,
        });
        await eventBus.emit({
          type: SystemEventType.SERVICE_EXPIRING,
          idempotencyKey: `service-expiring-3d:${service.id}`,
          payload: { serviceId: service.id, userId: service.userId },
        });
        sent += 1;
      } else if (remaining <= ONE_DAY_MS && remaining > 0) {
        await notifications.schedule({
          userId: service.userId,
          type: 'SERVICE_EXPIRING',
          templateKey: 'service_expiring_24h',
          deduplicationKey: `expiry-24h:${service.id}`,
          referenceType: 'service',
          referenceId: service.id,
        });
        sent += 1;
      }
    }
    return sent;
  }

  public async scanTrafficWarnings(batchSize = 100): Promise<number> {
    const services = await this.prisma.serviceInstance.findMany({
      where: { status: ServiceInstanceStatus.ACTIVE, deletedAt: null },
      take: batchSize,
    });
    const notifications = new NotificationService(this.prisma);
    let sent = 0;
    for (const service of services) {
      const limitBytes = BigInt(service.trafficLimitGb) * 1_073_741_824n;
      if (limitBytes <= 0n) continue;
      const ratio = Number((service.usedBytes * 100n) / limitBytes);
      if (ratio >= 95) {
        await notifications.schedule({
          userId: service.userId,
          type: 'TRAFFIC_WARNING',
          templateKey: 'traffic_95',
          deduplicationKey: `traffic-95:${service.id}`,
          variables: { percent: '95' },
          referenceType: 'service',
          referenceId: service.id,
        });
        sent += 1;
      } else if (ratio >= 80) {
        await notifications.schedule({
          userId: service.userId,
          type: 'TRAFFIC_WARNING',
          templateKey: 'traffic_80',
          deduplicationKey: `traffic-80:${service.id}`,
          variables: { percent: '80' },
          referenceType: 'service',
          referenceId: service.id,
        });
        sent += 1;
      }
    }
    return sent;
  }

  public async markExpiredServices(batchSize = 50): Promise<number> {
    const graceMs = config.engagement.serviceGracePeriodHours * 3_600_000;
    const cutoff = new Date(Date.now() - graceMs);
    const expired = await this.prisma.serviceInstance.findMany({
      where: {
        status: ServiceInstanceStatus.ACTIVE,
        expiresAt: { lt: cutoff },
        deletedAt: null,
      },
      take: batchSize,
    });
    for (const service of expired) {
      await this.prisma.serviceInstance.update({
        where: { id: service.id },
        data: { status: ServiceInstanceStatus.EXPIRED },
      });
      await new NotificationService(this.prisma).schedule({
        userId: service.userId,
        type: 'SERVICE_EXPIRED',
        templateKey: 'service_expired',
        deduplicationKey: `expired:${service.id}`,
        referenceType: 'service',
        referenceId: service.id,
      });
      await eventBus.emit({
        type: SystemEventType.SERVICE_EXPIRED,
        idempotencyKey: `service-expired:${service.id}`,
        payload: { serviceId: service.id, userId: service.userId },
      });
    }
    return expired.length;
  }

  public async scanInactivityReminders(batchSize = 50): Promise<number> {
    const cutoff = new Date(
      Date.now() - config.engagement.inactivityReminderDays * 86_400_000,
    );
    const inactive = await this.prisma.engagementScore.findMany({
      where: { lastLoginAt: { lt: cutoff } },
      take: batchSize,
    });
    const notifications = new NotificationService(this.prisma);
    for (const score of inactive) {
      await notifications.schedule({
        userId: score.userId,
        type: 'INACTIVITY_REMINDER',
        templateKey: 'inactivity_reminder',
        deduplicationKey: `inactive:${score.userId}`,
      });
    }
    return inactive.length;
  }
}
