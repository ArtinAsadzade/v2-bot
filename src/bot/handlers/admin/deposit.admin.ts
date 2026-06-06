import { prisma } from "../../../services/prisma";

export class WalletService {
  static async credit(userId: string, amount: number, reason?: string) {
    return prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        balance: {
          increment: amount,
        },
      },
    });
  }

  static async debit(userId: string, amount: number, reason?: string) {
    return prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        balance: {
          decrement: amount,
        },
      },
    });
  }

  static async getBalance(userId: string) {
    const user = await prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        balance: true,
      },
    });

    return user?.balance ?? 0;
  }
}
