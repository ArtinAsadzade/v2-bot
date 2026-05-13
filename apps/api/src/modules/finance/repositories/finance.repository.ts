import type { Prisma, PrismaClient } from '@prisma/client';

export type PrismaExecutor = PrismaClient | Prisma.TransactionClient;

export class FinanceRepository {
  public constructor(private readonly db: PrismaExecutor) {}

  public findWalletByUserId(userId: string) {
    return this.db.wallet.findUnique({ where: { userId } });
  }

  public createWallet(userId: string) {
    return this.db.wallet.create({ data: { userId } });
  }

  public upsertWallet(userId: string) {
    return this.db.wallet.upsert({ where: { userId }, update: {}, create: { userId } });
  }

  public async lockWallet(userId: string) {
    const rows = await this.db.$queryRaw<
      Array<{
        id: string;
        user_id: string;
        balance_toman: bigint;
        frozen_balance_toman: bigint;
        lifetime_deposits_toman: bigint;
        lifetime_spending_toman: bigint;
        version: number;
      }>
    >`
      SELECT id, user_id, balance_toman, frozen_balance_toman, lifetime_deposits_toman, lifetime_spending_toman, version
      FROM wallets
      WHERE user_id = ${userId}::uuid
      FOR UPDATE
    `;
    return rows[0] ?? null;
  }

  public listTransactions(userId: string, limit: number, cursor?: string) {
    return this.db.walletTransaction.findMany({
      where: { userId, ...(cursor ? { id: { lt: cursor } } : {}) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
    });
  }
}
