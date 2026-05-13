import { createHash } from 'node:crypto';

import {
  AuditActorType,
  CurrencyCode,
  FinancialAuditAction,
  PaymentInvoiceStatus,
  PaymentWebhookStatus,
  WalletTransactionDirection,
  WalletTransactionType,
} from '@prisma/client';

import { AppError, NotFoundError } from '../../../core/errors/app-error.js';
import { logger } from '../../../core/logger/logger.js';
import { enqueueDepositExpiration, enqueuePaymentVerification } from '../queues/payment.queues.js';
import { parseTomanInput } from './money.js';
import { WalletService } from './wallet.service.js';

import type { PaymentProvider } from '../providers/payment-provider.js';
import type { PrismaClient, PaymentNetwork } from '@prisma/client';

export class PaymentService {
  public constructor(
    private readonly prisma: PrismaClient,
    private readonly provider: PaymentProvider,
  ) {}

  public async createDeposit(input: {
    userId: string;
    amountToman: string;
    asset: 'USDT';
    network: PaymentNetwork;
    idempotencyKey: string;
  }) {
    const amountToman = parseTomanInput(input.amountToman);
    const wallet = await new WalletService(this.prisma).ensureWallet(input.userId);
    const existing = await this.prisma.paymentInvoice.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) return existing;

    const expiresAt = new Date(Date.now() + 30 * 60_000);
    const invoice = await this.prisma.$transaction(async (tx) => {
      const created = await tx.paymentInvoice.create({
        data: {
          userId: input.userId,
          walletId: wallet.id,
          provider: this.provider.name,
          network: input.network,
          asset: CurrencyCode.USDT,
          requestedToman: amountToman,
          idempotencyKey: input.idempotencyKey,
          expiresAt,
        },
      });
      const providerInvoice = await this.provider.createInvoice({
        invoiceId: created.id,
        amountToman,
        asset: CurrencyCode.USDT,
        network: input.network,
        expiresAt,
        idempotencyKey: input.idempotencyKey,
      });
      const updated = await tx.paymentInvoice.update({
        where: { id: created.id },
        data: {
          providerInvoiceId: providerInvoice.providerInvoiceId,
          assetAmount: providerInvoice.assetAmount,
          payAddress: providerInvoice.payAddress,
          memo: providerInvoice.memo,
          requiredConfirmations: providerInvoice.requiredConfirmations,
          metadata: providerInvoice.metadata as never,
        } as never,
      });
      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          userId: input.userId,
          type: WalletTransactionType.DEPOSIT,
          direction: WalletTransactionDirection.CREDIT,
          status: 'PENDING',
          amountToman,
          balanceBefore: wallet.balanceToman,
          balanceAfter: wallet.balanceToman,
          frozenBefore: wallet.frozenBalanceToman,
          frozenAfter: wallet.frozenBalanceToman,
          reason: 'Crypto deposit invoice created',
          referenceId: created.id,
          provider: this.provider.name,
          providerRef: providerInvoice.providerInvoiceId,
          idempotencyKey: `deposit-pending:${created.id}`,
          paymentInvoiceId: created.id,
        },
      });
      await tx.financialAuditLog.create({
        data: {
          action: FinancialAuditAction.INVOICE_CREATED,
          actorType: AuditActorType.USER,
          actorUserId: input.userId,
          userId: input.userId,
          walletId: wallet.id,
          invoiceId: created.id,
        },
      });
      return updated;
    });

    await enqueuePaymentVerification(
      { invoiceId: invoice.id },
      { jobId: `verify:${invoice.id}`, delay: 60_000 },
    );
    await enqueueDepositExpiration(
      { invoiceId: invoice.id },
      { jobId: `expire:${invoice.id}`, delay: Math.max(0, expiresAt.getTime() - Date.now()) },
    );
    return invoice;
  }

  public async verifyInvoice(invoiceId: string, idempotencyKey = `verify:${invoiceId}`) {
    const invoice = await this.prisma.paymentInvoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) throw new NotFoundError('Payment invoice');
    if (invoice.status === PaymentInvoiceStatus.PAID) return invoice;
    if (invoice.expiresAt < new Date()) await this.expireInvoice(invoice.id);
    if (!invoice.providerInvoiceId)
      throw new AppError('Invoice is missing provider reference', 'INVALID_PAYMENT_INVOICE', 409);

    const verification = await this.provider.verifyPayment(invoice.providerInvoiceId);
    if (!verification.paid || verification.confirmations < invoice.requiredConfirmations) {
      const status =
        verification.confirmations > 0
          ? PaymentInvoiceStatus.CONFIRMING
          : PaymentInvoiceStatus.PENDING;
      const updated = await this.prisma.paymentInvoice.update({
        where: { id: invoice.id },
        data: {
          status,
          confirmations: verification.confirmations,
          txHash: verification.txHash,
        } as never,
      });
      await enqueuePaymentVerification(
        { invoiceId: invoice.id },
        { jobId: `verify:${invoice.id}:${Date.now()}`, delay: 90_000 },
      );
      return updated;
    }

    const transaction = await new WalletService(this.prisma).applyLedger({
      userId: invoice.userId,
      amountToman: invoice.requestedToman,
      type: WalletTransactionType.DEPOSIT,
      direction: WalletTransactionDirection.CREDIT,
      reason: 'Crypto deposit confirmed',
      idempotencyKey: `deposit-credit:${invoice.id}:${idempotencyKey}`,
      referenceId: invoice.id,
      provider: invoice.provider,
      providerRef: invoice.providerInvoiceId,
      paymentInvoiceId: invoice.id,
      metadata: verification.raw,
    });

    const updated = await this.prisma.paymentInvoice.update({
      where: { id: invoice.id },
      data: {
        status: PaymentInvoiceStatus.PAID,
        confirmations: verification.confirmations,
        txHash: verification.txHash,
        providerPaymentId: verification.providerPaymentId,
        paidAt: new Date(),
      } as never,
    });
    await this.prisma.financialAuditLog.create({
      data: {
        action: FinancialAuditAction.PAYMENT_VERIFIED,
        actorType: AuditActorType.SYSTEM,
        userId: invoice.userId,
        walletId: invoice.walletId,
        invoiceId: invoice.id,
        transactionId: transaction.id,
      },
    });
    logger.info(
      { invoiceId: invoice.id, transactionId: transaction.id },
      'payment invoice credited',
    );
    return updated;
  }

  public async expireInvoice(invoiceId: string) {
    const invoice = await this.prisma.paymentInvoice.findUnique({ where: { id: invoiceId } });
    if (!invoice || invoice.status === PaymentInvoiceStatus.PAID) return invoice;
    if (invoice.expiresAt > new Date()) return invoice;
    const updated = await this.prisma.paymentInvoice.update({
      where: { id: invoice.id },
      data: { status: PaymentInvoiceStatus.EXPIRED },
    });
    await this.prisma.walletTransaction.updateMany({
      where: { paymentInvoiceId: invoice.id, status: 'PENDING' },
      data: { status: 'EXPIRED' },
    });
    await this.prisma.financialAuditLog.create({
      data: {
        action: FinancialAuditAction.PAYMENT_EXPIRED,
        actorType: AuditActorType.SYSTEM,
        userId: invoice.userId,
        walletId: invoice.walletId,
        invoiceId: invoice.id,
      },
    });
    return updated;
  }

  public async ingestWebhook(
    rawPayload: string,
    headers: { signature: string; timestamp: string; eventId: string },
  ) {
    const valid = this.provider.verifyWebhookSignature(
      rawPayload,
      headers.signature,
      headers.timestamp,
    );
    const payloadHash = createHash('sha256').update(rawPayload).digest('hex');
    const payload = JSON.parse(rawPayload) as Record<string, unknown>;
    const parsed = this.provider.parseWebhook(payload);
    const webhook = await this.prisma.paymentWebhook.upsert({
      where: {
        provider_eventId: {
          provider: this.provider.name,
          eventId: headers.eventId || parsed.eventId,
        },
      },
      update: {},
      create: {
        provider: this.provider.name,
        eventId: headers.eventId || parsed.eventId,
        status: valid ? PaymentWebhookStatus.VERIFIED : PaymentWebhookStatus.REJECTED,
        signature: headers.signature,
        payloadHash,
        payload,
      } as never,
    });
    if (!valid)
      throw new AppError('Invalid payment webhook signature', 'INVALID_WEBHOOK_SIGNATURE', 401);
    const invoice = parsed.invoiceId
      ? await this.prisma.paymentInvoice.findUnique({ where: { id: parsed.invoiceId } })
      : parsed.providerInvoiceId
        ? await this.prisma.paymentInvoice.findFirst({
            where: { provider: this.provider.name, providerInvoiceId: parsed.providerInvoiceId },
          })
        : null;
    if (!invoice) return webhook;
    await this.prisma.paymentWebhook.update({
      where: { id: webhook.id },
      data: { invoiceId: invoice.id },
    });
    await enqueuePaymentVerification(
      { invoiceId: invoice.id },
      { jobId: `webhook-verify:${webhook.id}` },
    );
    return webhook;
  }
}
