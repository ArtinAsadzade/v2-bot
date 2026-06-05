import { Worker, type Job } from 'bullmq';

import { config } from '../../../config/index.js';
import { logger } from '../../../core/logger/logger.js';
import { createBullmqConnection } from '../../../infrastructure/redis/client.js';
import { prisma } from '../../../infrastructure/prisma/client.js';
import { NotificationService } from '../../notifications/services/notification.service.js';

import type { TicketProcessingJob } from './ticket.queues.js';

export const createTicketWorkers = (): Worker[] => {
  const processor = async (job: Job<TicketProcessingJob>): Promise<void> => {
    const ticket = await prisma.supportTicket.findUnique({
      where: { id: job.data.ticketId },
      select: { id: true, userId: true, subject: true },
    });
    if (!ticket) return;
    const notifications = new NotificationService(prisma);
    if (job.data.action === 'created') {
      await notifications.schedule({
        userId: ticket.userId,
        type: 'SYSTEM_ANNOUNCEMENT',
        templateKey: 'ticket_created',
        deduplicationKey: `ticket-created:${ticket.id}`,
        variables: { subject: ticket.subject },
        referenceType: 'ticket',
        referenceId: ticket.id,
      });
    } else if (job.data.action === 'admin-reply') {
      await notifications.schedule({
        userId: ticket.userId,
        type: 'SYSTEM_ANNOUNCEMENT',
        templateKey: 'ticket_reply',
        deduplicationKey: `ticket-reply:${ticket.id}:${job.id}`,
        variables: { subject: ticket.subject },
        referenceType: 'ticket',
        referenceId: ticket.id,
      });
    }
    logger.debug({ ticketId: ticket.id, action: job.data.action }, 'ticket job processed');
  };
  return [
    new Worker<TicketProcessingJob>('ticket-processing', processor, {
      connection: createBullmqConnection(),
      prefix: config.queue.prefix,
    }),
  ];
};
