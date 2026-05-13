import type { JobsOptions } from 'bullmq';

import { createQueue } from '../../../infrastructure/queue/queue-factory.js';

export type PaymentVerificationJob = { invoiceId: string };
export type DepositExpirationJob = { invoiceId: string };
export type ReconciliationJob = { windowMinutes: number };
export type FinancialNotificationJob = {
  userId: string;
  template: 'deposit_paid' | 'deposit_failed' | 'payment_pending';
  payload: Record<string, unknown>;
};

export const paymentVerificationQueue = createQueue<PaymentVerificationJob>('payment-verification');
export const depositExpirationQueue = createQueue<DepositExpirationJob>('deposit-expiration');
export const financialReconciliationQueue = createQueue<ReconciliationJob>(
  'financial-reconciliation',
);
export const financialNotificationQueue =
  createQueue<FinancialNotificationJob>('financial-notifications');

export const enqueuePaymentVerification = (data: PaymentVerificationJob, options?: JobsOptions) =>
  paymentVerificationQueue.add('verify-payment', data, options);
export const enqueueDepositExpiration = (data: DepositExpirationJob, options?: JobsOptions) =>
  depositExpirationQueue.add('expire-deposit', data, options);
