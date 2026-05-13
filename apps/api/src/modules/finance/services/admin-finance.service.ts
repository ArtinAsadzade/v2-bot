import {
  AdminRole,
  AuditActorType,
  WalletTransactionDirection,
  WalletTransactionType,
} from '@prisma/client';

import { AppError, NotFoundError } from '../../../core/errors/app-error.js';
import { parseTomanInput } from './money.js';
import { WalletService } from './wallet.service.js';

import type { PrismaClient } from '@prisma/client';

const financeRoles = new Set<AdminRole>([AdminRole.OWNER, AdminRole.ADMIN, AdminRole.FINANCE]);

export class AdminFinanceService {
  public constructor(private readonly prisma: PrismaClient) {}

  private async assertFinanceAdmin(adminId: string) {
    const admin = await this.prisma.admin.findUnique({ where: { id: adminId } });
    if (!admin || !admin.isActive) throw new NotFoundError('Admin');
    if (!financeRoles.has(admin.role))
      throw new AppError('Finance permission required', 'FORBIDDEN_FINANCE_OPERATION', 403);
    return admin;
  }

  public async charge(input: {
    adminId: string;
    userId: string;
    amountToman: string;
    reason: string;
    idempotencyKey: string;
    metadata?: Record<string, unknown> | undefined;
  }) {
    await this.assertFinanceAdmin(input.adminId);
    return new WalletService(this.prisma).applyLedger({
      userId: input.userId,
      amountToman: parseTomanInput(input.amountToman),
      type: WalletTransactionType.ADMIN_ADJUSTMENT,
      direction: WalletTransactionDirection.CREDIT,
      reason: input.reason,
      idempotencyKey: input.idempotencyKey,
      actorType: AuditActorType.ADMIN,
      actorAdminId: input.adminId,
      metadata: input.metadata,
    });
  }

  public async deduct(input: {
    adminId: string;
    userId: string;
    amountToman: string;
    reason: string;
    idempotencyKey: string;
    metadata?: Record<string, unknown> | undefined;
  }) {
    await this.assertFinanceAdmin(input.adminId);
    return new WalletService(this.prisma).applyLedger({
      userId: input.userId,
      amountToman: parseTomanInput(input.amountToman),
      type: WalletTransactionType.PENALTY,
      direction: WalletTransactionDirection.DEBIT,
      reason: input.reason,
      idempotencyKey: input.idempotencyKey,
      actorType: AuditActorType.ADMIN,
      actorAdminId: input.adminId,
      metadata: input.metadata,
    });
  }

  public async bonus(input: {
    adminId: string;
    userId: string;
    amountToman: string;
    reason: string;
    idempotencyKey: string;
    metadata?: Record<string, unknown> | undefined;
  }) {
    await this.assertFinanceAdmin(input.adminId);
    return new WalletService(this.prisma).applyLedger({
      userId: input.userId,
      amountToman: parseTomanInput(input.amountToman),
      type: WalletTransactionType.BONUS,
      direction: WalletTransactionDirection.CREDIT,
      reason: input.reason,
      idempotencyKey: input.idempotencyKey,
      actorType: AuditActorType.ADMIN,
      actorAdminId: input.adminId,
      metadata: input.metadata,
    });
  }

  public async refund(input: {
    adminId: string;
    userId: string;
    amountToman: string;
    reason: string;
    idempotencyKey: string;
    metadata?: Record<string, unknown> | undefined;
  }) {
    await this.assertFinanceAdmin(input.adminId);
    return new WalletService(this.prisma).applyLedger({
      userId: input.userId,
      amountToman: parseTomanInput(input.amountToman),
      type: WalletTransactionType.REFUND,
      direction: WalletTransactionDirection.CREDIT,
      reason: input.reason,
      idempotencyKey: input.idempotencyKey,
      actorType: AuditActorType.ADMIN,
      actorAdminId: input.adminId,
      metadata: input.metadata,
    });
  }

  public async freeze(input: {
    adminId: string;
    userId: string;
    amountToman: string;
    reason: string;
    idempotencyKey: string;
  }) {
    await this.assertFinanceAdmin(input.adminId);
    return new WalletService(this.prisma).freeze(
      input.userId,
      parseTomanInput(input.amountToman),
      input.reason,
      input.idempotencyKey,
      input.adminId,
    );
  }

  public async unlock(input: {
    adminId: string;
    userId: string;
    amountToman: string;
    reason: string;
    idempotencyKey: string;
  }) {
    await this.assertFinanceAdmin(input.adminId);
    return new WalletService(this.prisma).unlock(
      input.userId,
      parseTomanInput(input.amountToman),
      input.reason,
      input.idempotencyKey,
      input.adminId,
    );
  }
}
