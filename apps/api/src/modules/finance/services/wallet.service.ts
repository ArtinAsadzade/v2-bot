import {
  AuditActorType,
  FinancialAuditAction,
  WalletTransactionDirection,
  WalletTransactionStatus,
  WalletTransactionType,
} from '@prisma/client';

import { AppError, NotFoundError } from '../../../core/errors/app-error.js';
import { logger } from '../../../core/logger/logger.js';
import { FinanceRepository } from '../repositories/finance.repository.js';
import { addToman, assertPositiveToman, subtractToman } from './money.js';

import type { PrismaClient } from '@prisma/client';

export type LedgerOperation = {
  userId: string;
  amountToman: bigint;
  type: WalletTransactionType;
  direction: WalletTransactionDirection;
  reason: string;
  idempotencyKey: string;
  referenceId?: string | undefined;
  provider?: string | undefined;
  providerRef?: string | undefined;
  paymentInvoiceId?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
  actorType?: AuditActorType | undefined;
  actorAdminId?: string | undefined;
};

export class WalletService {
  public constructor(private readonly prisma: PrismaClient) {}

  public async ensureWallet(userId: string) {
    return new FinanceRepository(this.prisma).upsertWallet(userId);
  }

  public async getBalance(userId: string) {
    return this.ensureWallet(userId);
  }

  public async listTransactions(userId: string, limit: number, cursor?: string) {
    return new FinanceRepository(this.prisma).listTransactions(userId, limit, cursor);
  }

  public async applyLedger(operation: LedgerOperation) {
    assertPositiveToman(operation.amountToman);
    const existing = await this.prisma.walletTransaction.findUnique({
      where: { idempotencyKey: operation.idempotencyKey },
    });
    if (existing) return existing;

    return this.prisma.$transaction(async (tx) => {
      const repository = new FinanceRepository(tx);
      await repository.upsertWallet(operation.userId);
      const wallet = await repository.lockWallet(operation.userId);
      if (!wallet) throw new NotFoundError('Wallet');

      const before = wallet.balance_toman;
      const frozenBefore = wallet.frozen_balance_toman;
      const after =
        operation.direction === WalletTransactionDirection.CREDIT
          ? addToman(before, operation.amountToman)
          : subtractToman(before, operation.amountToman);
      if (after < 0n)
        throw new AppError('Insufficient wallet balance', 'INSUFFICIENT_BALANCE', 409);

      const updated = await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          balanceToman: after,
          version: { increment: 1 },
          ...(operation.type === WalletTransactionType.DEPOSIT &&
          operation.direction === WalletTransactionDirection.CREDIT
            ? { lifetimeDepositsToman: { increment: operation.amountToman } }
            : {}),
          ...(operation.type === WalletTransactionType.PURCHASE &&
          operation.direction === WalletTransactionDirection.DEBIT
            ? { lifetimeSpendingToman: { increment: operation.amountToman } }
            : {}),
        },
      });

      const transaction = await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          userId: operation.userId,
          type: operation.type,
          direction: operation.direction,
          status: WalletTransactionStatus.COMPLETED,
          amountToman: operation.amountToman,
          balanceBefore: before,
          balanceAfter: updated.balanceToman,
          frozenBefore,
          frozenAfter: updated.frozenBalanceToman,
          reason: operation.reason,
          referenceId: operation.referenceId,
          provider: operation.provider,
          providerRef: operation.providerRef,
          idempotencyKey: operation.idempotencyKey,
          paymentInvoiceId: operation.paymentInvoiceId,
          metadata: operation.metadata as never,
        } as never,
      });

      await tx.financialAuditLog.create({
        data: {
          action:
            operation.direction === WalletTransactionDirection.CREDIT
              ? FinancialAuditAction.WALLET_CREDITED
              : FinancialAuditAction.WALLET_DEBITED,
          actorType: operation.actorType ?? AuditActorType.SYSTEM,
          actorAdminId: operation.actorAdminId,
          userId: operation.userId,
          walletId: wallet.id,
          transactionId: transaction.id,
          referenceId: operation.referenceId,
          metadata: { type: operation.type, reason: operation.reason },
        } as never,
      });

      logger.info(
        {
          userId: operation.userId,
          transactionId: transaction.id,
          amount: operation.amountToman.toString(),
        },
        'wallet ledger entry completed',
      );
      return transaction;
    });
  }

  public async freeze(
    userId: string,
    amountToman: bigint,
    reason: string,
    idempotencyKey: string,
    adminId: string,
  ) {
    assertPositiveToman(amountToman);
    const existing = await this.prisma.financialAuditLog.findFirst({
      where: { referenceId: idempotencyKey },
    });
    if (existing) return existing;
    return this.prisma.$transaction(async (tx) => {
      const repository = new FinanceRepository(tx);
      await repository.upsertWallet(userId);
      const wallet = await repository.lockWallet(userId);
      if (!wallet) throw new NotFoundError('Wallet');
      const available = wallet.balance_toman - wallet.frozen_balance_toman;
      if (available < amountToman)
        throw new AppError('Insufficient available balance', 'INSUFFICIENT_AVAILABLE_BALANCE', 409);
      const updated = await tx.wallet.update({
        where: { id: wallet.id },
        data: { frozenBalanceToman: { increment: amountToman }, version: { increment: 1 } },
      });
      return tx.financialAuditLog.create({
        data: {
          action: FinancialAuditAction.WALLET_FROZEN,
          actorType: AuditActorType.ADMIN,
          actorAdminId: adminId,
          userId,
          walletId: wallet.id,
          referenceId: idempotencyKey,
          metadata: {
            amountToman: amountToman.toString(),
            reason,
            frozenAfter: updated.frozenBalanceToman.toString(),
          },
        },
      });
    });
  }

  public async unlock(
    userId: string,
    amountToman: bigint,
    reason: string,
    idempotencyKey: string,
    adminId: string,
  ) {
    assertPositiveToman(amountToman);
    return this.prisma.$transaction(async (tx) => {
      const repository = new FinanceRepository(tx);
      const wallet = await repository.lockWallet(userId);
      if (!wallet) throw new NotFoundError('Wallet');
      if (wallet.frozen_balance_toman < amountToman)
        throw new AppError(
          'Frozen balance is lower than requested amount',
          'INVALID_FROZEN_BALANCE',
          409,
        );
      const updated = await tx.wallet.update({
        where: { id: wallet.id },
        data: { frozenBalanceToman: { decrement: amountToman }, version: { increment: 1 } },
      });
      return tx.financialAuditLog.create({
        data: {
          action: FinancialAuditAction.WALLET_UNLOCKED,
          actorType: AuditActorType.ADMIN,
          actorAdminId: adminId,
          userId,
          walletId: wallet.id,
          referenceId: idempotencyKey,
          metadata: {
            amountToman: amountToman.toString(),
            reason,
            frozenAfter: updated.frozenBalanceToman.toString(),
          },
        },
      });
    });
  }
}
