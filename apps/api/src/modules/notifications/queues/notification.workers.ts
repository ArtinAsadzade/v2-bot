import { NotificationStatus } from '@prisma/client';
import { Worker, type Job } from 'bullmq';

import { config } from '../../../config/index.js';
import { logger } from '../../../core/logger/logger.js';
import { createRedisConnection } from '../../../infrastructure/redis/client.js';
import { prisma } from '../../../infrastructure/prisma/client.js';
import { NotificationSpamGuard } from '../services/notification-spam-guard.js';
import { NotificationService } from '../services/notification.service.js';
import { TelegramNotificationSender } from '../services/telegram-notification.sender.js';

import type { NotificationDispatchJob } from './notification.queues.js';

export const createNotificationWorkers = (): Worker[] => {
  const redis = createRedisConnection();
  const spamGuard = new NotificationSpamGuard(redis);
  const sender = new TelegramNotificationSender();
  const notifications = new NotificationService(prisma);

  const processor = async (job: Job<NotificationDispatchJob>): Promise<void> => {
    if (job.name !== 'dispatch') return;
    const record = await prisma.notification.findUnique({
      where: { id: job.data.notificationId },
      include: { user: { select: { telegramId: true } } },
    });
    if (!record || record.status === NotificationStatus.SENT) return;
    if (!record.deduplicationKey) {
      await deliver(record.id, record.user.telegramId, `${record.title}\n\n${record.body}`);
      return;
    }
    const allowed = await spamGuard.canSend(record.userId, record.deduplicationKey);
    if (!allowed) {
      logger.debug({ notificationId: record.id }, 'notification skipped by spam guard');
      return;
    }
    const providerRef = await deliver(
      record.id,
      record.user.telegramId,
      `${record.title}\n\n${record.body}`,
    );
    await spamGuard.markSent(record.userId, record.deduplicationKey);
    await notifications.markDelivered(record.id, providerRef);
  };

  const deliver = async (notificationId: string, telegramId: string, text: string) => {
    try {
      const ref = await sender.send(telegramId, text);
      await prisma.notificationLog.create({
        data: {
          notificationId,
          userId: (await prisma.notification.findUniqueOrThrow({ where: { id: notificationId } }))
            .userId,
          channel: 'TELEGRAM',
          attempt: 1,
          status: NotificationStatus.SENT,
          providerRef: ref,
        },
      });
      return ref;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'send failed';
      await prisma.notificationLog.create({
        data: {
          notificationId,
          userId: (await prisma.notification.findUniqueOrThrow({ where: { id: notificationId } }))
            .userId,
          channel: 'TELEGRAM',
          attempt: 1,
          status: NotificationStatus.FAILED,
          errorMessage: message,
        },
      });
      await prisma.notification.update({
        where: { id: notificationId },
        data: { status: NotificationStatus.FAILED },
      });
      throw error;
    }
  };

  return [
    new Worker<NotificationDispatchJob>('notifications', processor, {
      connection: createRedisConnection(),
      prefix: config.queue.prefix,
    }),
  ];
};
