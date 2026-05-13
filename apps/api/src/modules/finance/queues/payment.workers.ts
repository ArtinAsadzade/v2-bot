import { Worker } from 'bullmq';

import { config } from '../../../config/index.js';
import { logger } from '../../../core/logger/logger.js';
import { prisma } from '../../../infrastructure/prisma/client.js';
import { createRedisConnection } from '../../../infrastructure/redis/client.js';
import { createPaymentProvider } from '../providers/provider-factory.js';
import { PaymentService } from '../services/payment.service.js';

import type {
  DepositExpirationJob,
  PaymentVerificationJob,
  ReconciliationJob,
} from './payment.queues.js';

const worker = <T>(queueName: string, processor: (job: T) => Promise<void>) =>
  new Worker(queueName, async (job) => processor(job.data as T), {
    connection: createRedisConnection(),
    prefix: config.queue.prefix,
  });

export const createFinanceWorkers = (): Worker[] => {
  const paymentService = new PaymentService(prisma, createPaymentProvider());
  return [
    worker<PaymentVerificationJob>('payment-verification', async (job) => {
      await paymentService.verifyInvoice(job.invoiceId);
    }),
    worker<DepositExpirationJob>('deposit-expiration', async (job) => {
      await paymentService.expireInvoice(job.invoiceId);
    }),
    worker<ReconciliationJob>('financial-reconciliation', async (job) => {
      logger.info(
        { windowMinutes: job.windowMinutes },
        'financial reconciliation placeholder completed',
      );
      await prisma.financialAuditLog.create({
        data: {
          action: 'RECONCILIATION_CHECKED',
          actorType: 'SYSTEM',
          metadata: { windowMinutes: job.windowMinutes },
        },
      });
    }),
  ];
};
