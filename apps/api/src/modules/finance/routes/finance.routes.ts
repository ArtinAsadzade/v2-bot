import { ok } from '@v2bot/shared';

import { ValidationAppError } from '../../../core/errors/app-error.js';
import { createPaymentProvider } from '../providers/provider-factory.js';
import { AdminFinanceService } from '../services/admin-finance.service.js';
import { PaymentService } from '../services/payment.service.js';
import { PricingService } from '../services/pricing.service.js';
import { serializeFinancial } from '../services/serializer.js';
import { WalletService } from '../services/wallet.service.js';
import {
  adminWalletOperationSchema,
  createDepositSchema,
  freezeWalletSchema,
  listTransactionsQuerySchema,
  pricingSchema,
  purchaseDraftSchema,
  userIdParamsSchema,
  verifyPaymentSchema,
  webhookHeadersSchema,
} from '../validators/finance.validators.js';

import type { FastifyPluginAsync } from 'fastify';

export const financeRoutes: FastifyPluginAsync = async (app) => {
  app.get('/wallets/:userId', async (request) => {
    const parsed = userIdParamsSchema.safeParse(request.params);
    if (!parsed.success) throw new ValidationAppError(parsed.error.flatten());
    const wallet = await new WalletService(app.prisma).getBalance(parsed.data.userId);
    return ok(serializeFinancial(wallet));
  });

  app.get('/wallets/:userId/transactions', async (request) => {
    const params = userIdParamsSchema.safeParse(request.params);
    const query = listTransactionsQuerySchema.safeParse(request.query);
    if (!params.success || !query.success)
      throw new ValidationAppError({
        params: params.success ? undefined : params.error.flatten(),
        query: query.success ? undefined : query.error.flatten(),
      });
    const transactions = await new WalletService(app.prisma).listTransactions(
      params.data.userId,
      query.data.limit,
      query.data.cursor,
    );
    return ok(serializeFinancial(transactions));
  });

  app.post('/payments/deposits', async (request) => {
    const parsed = createDepositSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationAppError(parsed.error.flatten());
    const invoice = await new PaymentService(app.prisma, createPaymentProvider()).createDeposit(
      parsed.data,
    );
    return ok(serializeFinancial(invoice));
  });

  app.post('/payments/verify', async (request) => {
    const parsed = verifyPaymentSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationAppError(parsed.error.flatten());
    const invoice = await new PaymentService(app.prisma, createPaymentProvider()).verifyInvoice(
      parsed.data.invoiceId,
      parsed.data.idempotencyKey,
    );
    return ok(serializeFinancial(invoice));
  });

  app.post('/payments/webhooks/crypto', async (request) => {
    const headers = webhookHeadersSchema.safeParse(request.headers);
    if (!headers.success) throw new ValidationAppError(headers.error.flatten());
    const rawPayload =
      typeof request.body === 'string' ? request.body : JSON.stringify(request.body ?? {});
    const webhook = await new PaymentService(app.prisma, createPaymentProvider()).ingestWebhook(
      rawPayload,
      {
        signature: headers.data['x-payment-signature'],
        timestamp: headers.data['x-payment-timestamp'],
        eventId: headers.data['x-payment-event-id'],
      },
    );
    return ok(serializeFinancial(webhook));
  });

  app.post('/pricing/calculate', async (request) => {
    const parsed = pricingSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationAppError(parsed.error.flatten());
    return ok(serializeFinancial(await new PricingService(app.prisma).calculate(parsed.data)));
  });

  app.post('/purchases/drafts', async (request) => {
    const parsed = purchaseDraftSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationAppError(parsed.error.flatten());
    return ok(
      serializeFinancial(await new PricingService(app.prisma).createPurchaseDraft(parsed.data)),
    );
  });

  app.post('/admin/wallets/charge', async (request) => {
    const parsed = adminWalletOperationSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationAppError(parsed.error.flatten());
    return ok(serializeFinancial(await new AdminFinanceService(app.prisma).charge(parsed.data)));
  });

  app.post('/admin/wallets/deduct', async (request) => {
    const parsed = adminWalletOperationSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationAppError(parsed.error.flatten());
    return ok(serializeFinancial(await new AdminFinanceService(app.prisma).deduct(parsed.data)));
  });

  app.post('/admin/wallets/bonus', async (request) => {
    const parsed = adminWalletOperationSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationAppError(parsed.error.flatten());
    return ok(serializeFinancial(await new AdminFinanceService(app.prisma).bonus(parsed.data)));
  });

  app.post('/admin/wallets/refund', async (request) => {
    const parsed = adminWalletOperationSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationAppError(parsed.error.flatten());
    return ok(serializeFinancial(await new AdminFinanceService(app.prisma).refund(parsed.data)));
  });

  app.post('/admin/wallets/freeze', async (request) => {
    const parsed = freezeWalletSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationAppError(parsed.error.flatten());
    return ok(serializeFinancial(await new AdminFinanceService(app.prisma).freeze(parsed.data)));
  });

  app.post('/admin/wallets/unlock', async (request) => {
    const parsed = freezeWalletSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationAppError(parsed.error.flatten());
    return ok(serializeFinancial(await new AdminFinanceService(app.prisma).unlock(parsed.data)));
  });
};
