import { createQueue } from '../../../infrastructure/queue/queue-factory.js';

export type TicketProcessingJob = {
  ticketId: string;
  action: 'created' | 'user-reply' | 'admin-reply';
};

export const ticketProcessingQueue = createQueue<TicketProcessingJob>('ticket-processing');

export const enqueueTicketProcessing = async (job: TicketProcessingJob): Promise<void> => {
  await ticketProcessingQueue.add(job.action, job, {
    jobId: `ticket:${job.ticketId}:${job.action}:${Date.now()}`,
  });
};

export const enqueueTicketNotification = async (input: {
  ticketId: string;
  userId: string;
}): Promise<void> => {
  await ticketProcessingQueue.add(
    'notify-user',
    { ticketId: input.ticketId, action: 'created' },
    { jobId: `ticket-notify:${input.ticketId}` },
  );
};
