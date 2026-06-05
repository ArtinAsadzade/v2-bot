import { createQueue } from '../../../infrastructure/queue/queue-factory.js';

export type LifecycleJob =
  | { kind: 'expiry-reminder'; batchSize?: number }
  | { kind: 'traffic-warning'; batchSize?: number }
  | { kind: 'expire-mark'; batchSize?: number }
  | { kind: 'inactivity'; batchSize?: number }
  | {
      kind: 'purchase-notify';
      userId: string;
      purchaseId: string;
      amountToman: string;
      idempotencyKey: string;
      referrerId?: string;
    }
  | { kind: 'payment-notify'; userId: string; invoiceId: string; amountToman: string };

export const lifecycleQueue = createQueue<LifecycleJob>('service-lifecycle');

export const enqueueLifecycleCheck = async (
  kind: LifecycleJob['kind'],
  payload: Record<string, unknown> = {},
): Promise<void> => {
  await lifecycleQueue.add(kind, { kind, ...payload } as LifecycleJob, {
    jobId: `lifecycle:${kind}:${Date.now()}`,
  });
};

export const enqueuePurchaseNotification = async (input: {
  userId: string;
  purchaseId: string;
  amountToman: string;
  idempotencyKey: string;
  referrerId?: string;
}): Promise<void> => {
  await lifecycleQueue.add(
    'purchase-notify',
    {
      kind: 'purchase-notify',
      userId: input.userId,
      purchaseId: input.purchaseId,
      amountToman: input.amountToman,
      idempotencyKey: input.idempotencyKey,
      ...(input.referrerId !== undefined ? { referrerId: input.referrerId } : {}),
    } as LifecycleJob,
    { jobId: `purchase-notify:${input.idempotencyKey}` },
  );
};

export const enqueuePaymentNotification = async (input: {
  userId: string;
  invoiceId: string;
  amountToman: string;
}): Promise<void> => {
  await lifecycleQueue.add(
    'payment-notify',
    {
      kind: 'payment-notify',
      userId: input.userId,
      invoiceId: input.invoiceId,
      amountToman: input.amountToman,
    } as LifecycleJob,
    { jobId: `payment-notify:${input.invoiceId}` },
  );
};
