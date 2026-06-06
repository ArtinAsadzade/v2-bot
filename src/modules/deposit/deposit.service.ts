import { prisma } from "../../services/prisma";
import { WalletService } from "../wallet/wallet.service";

export const DEPOSIT_WALLETS = {
  usdt: process.env.USDT_WALLET_ADDRESS ?? "TRC20_WALLET_ADDRESS",
  btc: process.env.BTC_WALLET_ADDRESS ?? "BTC_WALLET_ADDRESS",
} as const;

export type DepositCurrency = keyof typeof DEPOSIT_WALLETS;

export class DepositService {
  static async createDeposit(userId: string, amount: number, cryptoType: DepositCurrency) {
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new Error("مبلغ شارژ معتبر نیست");
    }

    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    return prisma.deposit.create({
      data: {
        userId,
        amount,
        cryptoType,
        wallet: DEPOSIT_WALLETS[cryptoType],
        status: "pending",
        expiresAt,
      },
    });
  }

  static async submitReceipt(depositId: string, userId: string, receipt: string) {
    const updated = await prisma.deposit.updateMany({
      where: { id: depositId, userId, status: "pending", expiresAt: { gt: new Date() } },
      data: { receipt, status: "submitted" },
    });

    if (updated.count !== 1) {
      throw new Error("درخواست شارژ فعال یا معتبر نیست");
    }
  }

  static async approve(depositId: string, adminTelegramId: string) {
    return prisma.$transaction(async (tx) => {
      const deposit = await tx.deposit.findUnique({ where: { id: depositId } });
      if (!deposit || deposit.status !== "submitted") {
        throw new Error("درخواست شارژ قابل تایید نیست");
      }

      await tx.deposit.update({ where: { id: depositId }, data: { status: "approved" } });
      await WalletService.credit(deposit.userId, deposit.amount, `تایید شارژ ${deposit.id}`, tx);
      await tx.auditLog.create({
        data: { actorId: adminTelegramId, action: "deposit.approve", metadata: JSON.stringify({ depositId }) },
      });

      return deposit;
    });
  }

  static async reject(depositId: string, adminTelegramId: string) {
    const deposit = await prisma.deposit.update({ where: { id: depositId }, data: { status: "rejected" } });
    await prisma.auditLog.create({
      data: { actorId: adminTelegramId, action: "deposit.reject", metadata: JSON.stringify({ depositId }) },
    });
    return deposit;
  }
}
