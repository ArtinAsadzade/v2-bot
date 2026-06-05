import { createQueue } from '../../../infrastructure/queue/queue-factory.js';

export type NotificationDispatchJob = { notificationId: string };

export const notificationDispatchQueue = createQueue<NotificationDispatchJob>('notifications');

export const enqueueNotificationDispatch = async (
  job: NotificationDispatchJob,
): Promise<void> => {
  await notificationDispatchQueue.add('dispatch', job, {
    jobId: `notify:${job.notificationId}`,
  });
};
