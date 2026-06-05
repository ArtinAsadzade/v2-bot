import { prisma } from "../../services/prisma";

export class DepositService {
  static async createDeposit(userId: string, amount: number, cryptoType: string, wallet: string) {
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 30);

    return prisma.deposit.create({
      data: {
        userId,
        amount,
        cryptoType,
        wallet,
        status: "pending",
        expiresAt,
      },
    });
  }
}
