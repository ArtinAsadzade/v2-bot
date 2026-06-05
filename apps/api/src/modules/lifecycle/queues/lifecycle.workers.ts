import { SystemEventType } from '@prisma/client';
import { Worker, type Job } from 'bullmq';

import { config } from '../../../config/index.js';
import { createRedisConnection } from '../../../infrastructure/redis/client.js';
import { prisma } from '../../../infrastructure/prisma/client.js';
import { eventBus } from '../../../infrastructure/events/event-bus.js';
import { NotificationService } from '../../notifications/services/notification.service.js';
import { LifecycleAutomationService } from '../services/lifecycle-automation.service.js';

import type { LifecycleJob } from './lifecycle.queues.js';

export const createLifecycleWorkers = (): Worker[] => {
  const automation = new LifecycleAutomationService(prisma);
  const processor = async (job: Job<LifecycleJob>): Promise<void> => {
    const data = job.data;
    switch (data.kind) {
      case 'expiry-reminder':
        await automation.scanExpiryReminders(data.batchSize);
        break;
      case 'traffic-warning':
        await automation.scanTrafficWarnings(data.batchSize);
        break;
      case 'expire-mark':
        await automation.markExpiredServices(data.batchSize);
        break;
      case 'inactivity':
        await automation.scanInactivityReminders(data.batchSize);
        break;
      case 'purchase-notify': {
        await new NotificationService(prisma).schedule({
          userId: data.userId,
          type: 'PURCHASE_CONFIRMATION',
          templateKey: 'purchase_confirmation',
          deduplicationKey: `purchase:${data.purchaseId}`,
          referenceType: 'purchase',
          referenceId: data.purchaseId,
        });
        await eventBus.emit({
          type: SystemEventType.PURCHASE_COMPLETED,
          idempotencyKey: `purchase-completed:${data.purchaseId}`,
          aggregateType: 'purchase',
          aggregateId: data.purchaseId,
          payload: {
            userId: data.userId,
            purchaseId: data.purchaseId,
            amountToman: data.amountToman,
            idempotencyKey: data.idempotencyKey,
            referrerId: data.referrerId,
          },
        });
        break;
      }
      case 'payment-notify': {
        await new NotificationService(prisma).schedule({
          userId: data.userId,
          type: 'DEPOSIT_SUCCESS',
          templateKey: 'deposit_success',
          deduplicationKey: `deposit:${data.invoiceId}`,
          variables: { amountToman: data.amountToman },
          referenceType: 'invoice',
          referenceId: data.invoiceId,
        });
        break;
      }
      default:
        break;
    }
  };
  return [
    new Worker<LifecycleJob>('service-lifecycle', processor, {
      connection: createRedisConnection(),
      prefix: config.queue.prefix,
    }),
  ];
};
