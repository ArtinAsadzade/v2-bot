import { Prisma, type PrismaClient } from '@prisma/client';

export class WalletService {
  constructor(private readonly prisma: PrismaClient) {}

  async getBalance(userId: string): Promise<bigint> {
    const wallet = await this.prisma.wallet.findUniqueOrThrow({ where: { userId } });
    return wallet.balanceToman;
  }

  async credit(input: { userId: string; amountToman: bigint; reason: string; idempotencyKey: string }) {
    return this.prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId: input.userId } });
      const balanceAfter = wallet.balanceToman + input.amountToman;
      await tx.wallet.update({ where: { id: wallet.id }, data: { balanceToman: balanceAfter } });
      return tx.walletLedger.create({
        data: {
          walletId: wallet.id,
          direction: 'CREDIT',
          amountToman: input.amountToman,
          balanceAfter,
          reason: input.reason,
          idempotencyKey: input.idempotencyKey,
        },
      });
    });
  }

  async debitOrThrow(input: { userId: string; amountToman: bigint; reason: string; idempotencyKey: string }) {
    return this.prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId: input.userId } });
      if (wallet.balanceToman < input.amountToman) {
        throw new Prisma.PrismaClientKnownRequestError('INSUFFICIENT_BALANCE', {
          code: 'P2000',
          clientVersion: Prisma.prismaVersion.client,
        });
      }
      const balanceAfter = wallet.balanceToman - input.amountToman;
      await tx.wallet.update({ where: { id: wallet.id }, data: { balanceToman: balanceAfter } });
      return tx.walletLedger.create({
        data: {
          walletId: wallet.id,
          direction: 'DEBIT',
          amountToman: input.amountToman,
          balanceAfter,
          reason: input.reason,
          idempotencyKey: input.idempotencyKey,
        },
      });
    });
  }
}
