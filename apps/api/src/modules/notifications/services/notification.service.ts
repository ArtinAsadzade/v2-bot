import {
  NotificationChannel,
  NotificationStatus,
  NotificationType,
  SystemEventType,
} from '@prisma/client';

import { eventBus } from '../../../infrastructure/events/event-bus.js';
import { enqueueNotificationDispatch } from '../queues/notification.queues.js';
import {
  renderNotificationTemplate,
  templateKeyForType,
} from './notification-templates.js';

import type { PrismaClient } from '@prisma/client';

export class NotificationService {
  public constructor(private readonly prisma: PrismaClient) {}

  public async schedule(input: {
    userId: string;
    type: NotificationType;
    templateKey?: string;
    deduplicationKey: string;
    variables?: Record<string, string>;
    referenceType?: string;
    referenceId?: string;
    scheduledAt?: Date;
  }) {
    const templateKey = input.templateKey ?? templateKeyForType(input.type);
    const rendered = renderNotificationTemplate(templateKey, input.variables ?? {});
    const existing = await this.prisma.notification.findUnique({
      where: {
        userId_deduplicationKey: {
          userId: input.userId,
          deduplicationKey: input.deduplicationKey,
        },
      },
    });
    if (existing) return existing;

    const notification = await this.prisma.notification.create({
      data: {
        userId: input.userId,
        channel: NotificationChannel.TELEGRAM,
        type: input.type,
        status: NotificationStatus.PENDING,
        title: rendered.title,
        body: rendered.body,
        templateKey,
        deduplicationKey: input.deduplicationKey,
        referenceType: input.referenceType ?? null,
        referenceId: input.referenceId ?? null,
        ...(input.scheduledAt !== undefined ? { scheduledAt: input.scheduledAt } : {}),
        payload: input.variables as never,
      },
    });

    await enqueueNotificationDispatch({ notificationId: notification.id });
    return notification;
  }

  public async listForUser(userId: string, limit = 20) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  public async markDelivered(notificationId: string, providerRef: string): Promise<void> {
    await this.prisma.notification.update({
      where: { id: notificationId },
      data: { status: NotificationStatus.SENT, sentAt: new Date() },
    });
    await eventBus.emit({
      type: SystemEventType.NOTIFICATION_SENT,
      idempotencyKey: `notification-sent:${notificationId}`,
      aggregateType: 'notification',
      aggregateId: notificationId,
      payload: { notificationId, providerRef },
    });
  }
}
