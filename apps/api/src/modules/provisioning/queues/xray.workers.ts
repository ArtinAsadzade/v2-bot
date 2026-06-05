import { ProvisioningJobStatus, ServiceInstanceStatus, XrayClientStatus } from '@prisma/client';
import { Worker, type Job } from 'bullmq';

import { config } from '../../../config/index.js';
import { logger } from '../../../core/logger/logger.js';
import { prisma } from '../../../infrastructure/prisma/client.js';
import { createRedisConnection } from '../../../infrastructure/redis/client.js';
import { ServiceLifecycleService } from '../services/service-lifecycle.service.js';

import type {
  ExpirationCheckJob,
  ProvisionRetryJob,
  TrafficSyncJob,
} from './provisioning.queues.js';

type XrayJobData = TrafficSyncJob | ExpirationCheckJob | ProvisionRetryJob;

export const createXrayWorkers = (): Worker[] => {
  const lifecycle = new ServiceLifecycleService(prisma);
  const processor = async (job: Job<XrayJobData>): Promise<void> => {
    switch (job.name) {
      case 'traffic-sync': {
        const data = job.data as TrafficSyncJob;
        await lifecycle.syncTraffic(data.serviceInstanceId);
        logger.debug({ serviceId: data.serviceInstanceId }, 'traffic sync completed');
        break;
      }
      case 'expiration-check': {
        const data = job.data as ExpirationCheckJob;
        const batchSize = data.batchSize ?? 50;
        const expired = await prisma.serviceInstance.findMany({
          where: {
            status: ServiceInstanceStatus.ACTIVE,
            expiresAt: { lt: new Date() },
            deletedAt: null,
          },
          take: batchSize,
        });
        for (const service of expired) {
          await prisma.serviceInstance.update({
            where: { id: service.id },
            data: { status: ServiceInstanceStatus.EXPIRED },
          });
          if (service.xrayClientId) {
            await prisma.xrayClient.update({
              where: { id: service.xrayClientId },
              data: { status: XrayClientStatus.EXPIRED },
            });
          }
          logger.info({ serviceId: service.id }, 'service marked expired');
        }
        break;
      }
      case 'provision-retry': {
        const data = job.data as ProvisionRetryJob;
        const provisionJob = await prisma.provisioningJob.findUnique({
          where: { id: data.provisioningJobId },
          include: { serviceInstance: true },
        });
        if (!provisionJob || provisionJob.status === ProvisioningJobStatus.SUCCEEDED) return;
        await prisma.provisioningJob.update({
          where: { id: data.provisioningJobId },
          data: { status: ProvisioningJobStatus.PROCESSING, attempt: { increment: 1 } },
        });
        await lifecycle.syncTraffic(data.serviceInstanceId);
        await prisma.provisioningJob.update({
          where: { id: data.provisioningJobId },
          data: { status: ProvisioningJobStatus.SUCCEEDED, completedAt: new Date() },
        });
        break;
      }
      default:
        logger.warn({ jobName: job.name }, 'unknown xray-sync job');
    }
  };

  return [
    new Worker<XrayJobData>('xray-sync', processor, {
      connection: createRedisConnection(),
      prefix: config.queue.prefix,
    }),
  ];
};
