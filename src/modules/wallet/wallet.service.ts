import { prisma } from "../../services/prisma";

export class WalletService {
  static async getBalance(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    return user?.balance || 0;
  }

  static async addBalance(userId: string, amount: number, reason: string) {
    return prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: userId },
        data: {
          balance: {
            increment: amount,
          },
        },
      });

      await tx.transaction.create({
        data: {
          userId,
          amount,
          type: "credit",
          reason,
        },
      });

      return user;
    });
  }

  static async subtractBalance(userId: string, amount: number, reason: string) {
    return prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
      });

      if (!user || user.balance < amount) {
        throw new Error("Insufficient balance");
      }

      const updated = await tx.user.update({
        where: { id: userId },
        data: {
          balance: {
            decrement: amount,
          },
        },
      });

      await tx.transaction.create({
        data: {
          userId,
          amount,
          type: "debit",
          reason,
        },
      });

      return updated;
    });
  }

  static async creditFromDeposit(userId: string, amount: number, reason: string) {
    return prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          balance: {
            increment: amount,
          },
        },
      });

      await tx.transaction.create({
        data: {
          userId,
          amount,
          type: "credit",
          reason,
        },
      });
    });
  }
}
