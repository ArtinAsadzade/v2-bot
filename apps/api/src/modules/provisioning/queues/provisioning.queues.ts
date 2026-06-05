import { createQueue } from '../../../infrastructure/queue/queue-factory.js';

export type TrafficSyncJob = { serviceInstanceId: string };
export type ExpirationCheckJob = { batchSize?: number };
export type ProvisionRetryJob = { provisioningJobId: string; serviceInstanceId: string };
export type ServiceCleanupJob = { serviceInstanceId: string };

export const trafficSyncQueue = createQueue<TrafficSyncJob>('xray-sync');
export const provisionRetryQueue = createQueue<ProvisionRetryJob>('xray-sync');
export const expirationCheckQueue = createQueue<ExpirationCheckJob>('xray-sync');
export const serviceCleanupQueue = createQueue<ProvisionRetryJob>('xray-sync');

export const enqueueTrafficSync = async (serviceInstanceId: string): Promise<void> => {
  await trafficSyncQueue.add(
    'traffic-sync',
    { serviceInstanceId },
    { jobId: `traffic:${serviceInstanceId}:${Date.now()}`, delay: 0 },
  );
};

export const enqueueProvisionRetry = async (input: ProvisionRetryJob): Promise<void> => {
  await provisionRetryQueue.add('provision-retry', input, {
    jobId: `retry:${input.provisioningJobId}`,
    delay: 60_000,
    attempts: 5,
  });
};
