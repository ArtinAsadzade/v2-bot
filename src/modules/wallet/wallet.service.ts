import { prisma } from "../../services/prisma";
import type { Prisma } from "@prisma/client";

type TxClient = Prisma.TransactionClient;

function assertPositiveAmount(amount: number) {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error("Amount must be a positive integer");
  }
}

export class WalletService {
  static async getBalance(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { balance: true } });
    return user?.balance ?? 0;
  }

  static async credit(userId: string, amount: number, description: string, tx: TxClient = prisma) {
    assertPositiveAmount(amount);

    const user = await tx.user.update({
      where: { id: userId },
      data: { balance: { increment: amount } },
    });

    await tx.walletTransaction.create({
      data: { userId, amount, type: "credit", description },
    });

    return user;
  }

  static async debit(userId: string, amount: number, description: string, tx: TxClient = prisma) {
    assertPositiveAmount(amount);

    const updated = await tx.user.updateMany({
      where: { id: userId, balance: { gte: amount } },
      data: { balance: { decrement: amount } },
    });

    if (updated.count !== 1) {
      throw new Error("موجودی کیف پول کافی نیست");
    }

    await tx.walletTransaction.create({
      data: { userId, amount, type: "debit", description },
    });

    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    return user;
  }

  static async transfer(fromUserId: string, toUserId: string, amount: number, description: string) {
    assertPositiveAmount(amount);
    if (fromUserId === toUserId) {
      throw new Error("Cannot transfer to the same wallet");
    }

    return prisma.$transaction(async (tx) => {
      const debited = await tx.user.updateMany({
        where: { id: fromUserId, balance: { gte: amount } },
        data: { balance: { decrement: amount } },
      });
      if (debited.count !== 1) {
        throw new Error("موجودی کیف پول کافی نیست");
      }

      const receiver = await tx.user.update({
        where: { id: toUserId },
        data: { balance: { increment: amount } },
      });

      await tx.walletTransaction.create({
        data: { userId: fromUserId, amount, type: "transfer_out", description },
      });
      await tx.walletTransaction.create({
        data: { userId: toUserId, amount, type: "transfer_in", description },
      });

      const sender = await tx.user.findUniqueOrThrow({ where: { id: fromUserId } });
      return { sender, receiver };
    });
  }

  static addBalance(userId: string, amount: number, reason: string) {
    return WalletService.credit(userId, amount, reason);
  }

  static subtractBalance(userId: string, amount: number, reason: string) {
    return WalletService.debit(userId, amount, reason);
  }

  static creditFromDeposit(userId: string, amount: number, reason: string) {
    return prisma.$transaction((tx) => WalletService.credit(userId, amount, reason, tx));
  }
}
