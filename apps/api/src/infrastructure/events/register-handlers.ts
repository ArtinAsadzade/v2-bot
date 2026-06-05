import { SystemEventType } from '@prisma/client';

import { logger } from '../../core/logger/logger.js';
import { enqueueAnalyticsIncrement } from '../../modules/analytics/queues/analytics.queues.js';
import { enqueueReferralReward } from '../../modules/referrals/queues/referral.queues.js';
import {
  enqueueLifecycleCheck,
  enqueuePurchaseNotification,
  enqueuePaymentNotification,
} from '../../modules/lifecycle/queues/lifecycle.queues.js';
import { enqueueTicketNotification } from '../../modules/support/queues/ticket.queues.js';
import { eventBus } from './event-bus.js';

import type { DomainEvent } from './event-types.js';

export const registerEventHandlers = (): void => {
  eventBus.on(SystemEventType.REFERRAL_ACTIVATED, async (event: DomainEvent) => {
    await enqueueAnalyticsIncrement('REFERRAL_CONVERSIONS', 1);
    const payload = event.payload as { referrerId?: string; refereeId?: string };
    if (payload.referrerId && payload.refereeId) {
      logReferralActivated(payload.referrerId, payload.refereeId);
    }
  });

  eventBus.on(SystemEventType.PURCHASE_COMPLETED, async (event: DomainEvent) => {
    const payload = event.payload as {
      userId: string;
      purchaseId: string;
      amountToman: string;
      idempotencyKey: string;
      referrerId?: string;
    };
    await enqueueAnalyticsIncrement('PURCHASES', 1);
    await enqueuePurchaseNotification(payload);
    if (payload.referrerId) {
      await enqueueReferralReward({
        referrerId: payload.referrerId,
        refereeId: payload.userId,
        baseAmountToman: payload.amountToman,
        idempotencyKey: `referral:${payload.idempotencyKey}`,
      });
    }
  });

  eventBus.on(SystemEventType.PAYMENT_SUCCESS, async (event: DomainEvent) => {
    const payload = event.payload as { userId: string; invoiceId: string; amountToman: string };
    await enqueuePaymentNotification(payload);
  });

  eventBus.on(SystemEventType.TICKET_CREATED, async (event: DomainEvent) => {
    const payload = event.payload as { ticketId: string; userId: string };
    await enqueueTicketNotification(payload);
    await enqueueAnalyticsIncrement('TICKETS_CREATED', 1);
  });

  eventBus.on(SystemEventType.SERVICE_EXPIRING, async (event: DomainEvent) => {
    await enqueueLifecycleCheck('expiry-reminder', event.payload as Record<string, unknown>);
  });

  eventBus.on(SystemEventType.SERVICE_EXPIRED, async (event: DomainEvent) => {
    await enqueueLifecycleCheck('expire-mark', event.payload as Record<string, unknown>);
  });

  eventBus.on(SystemEventType.NOTIFICATION_SENT, async () => {
    await enqueueAnalyticsIncrement('NOTIFICATIONS_SENT', 1);
  });

  eventBus.on(SystemEventType.USER_CREATED, async () => {
    await enqueueAnalyticsIncrement('ACTIVE_USERS', 1);
  });
};

const logReferralActivated = (referrerId: string, refereeId: string): void => {
  logger.info({ referrerId, refereeId }, 'referral activated');
};
