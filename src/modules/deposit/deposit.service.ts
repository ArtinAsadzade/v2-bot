import { prisma } from "../../services/prisma";
import { WalletService } from "../wallet/wallet.service";
import { notificationService } from "../../services/notification.service";
import { eventBus } from "../../services/event-bus.service";

export const DEPOSIT_WALLETS = {
  usdt: process.env.USDT_WALLET_ADDRESS ?? "TRC20_WALLET_ADDRESS",
  btc: process.env.BTC_WALLET_ADDRESS ?? "BTC_WALLET_ADDRESS",
} as const;

export type DepositCurrency = keyof typeof DEPOSIT_WALLETS;

export function isDepositCurrency(value: string): value is DepositCurrency {
  return value === "usdt" || value === "btc";
}

export class DepositService {
  static async createDeposit(userId: string, amount: number, cryptoType: DepositCurrency) {
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new Error("مبلغ شارژ معتبر نیست");
    }

    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    const deposit = await prisma.deposit.create({
      data: {
        userId,
        amount,
        cryptoType,
        wallet: DEPOSIT_WALLETS[cryptoType],
        status: "pending",
        expiresAt,
      },
    });

    eventBus.emit("deposit.created", { depositId: deposit.id, userId, amount, cryptoType, wallet: deposit.wallet });
    return deposit;
  }

  static async submitReceipt(depositId: string, userId: string, receipt: string) {
    const deposit = await prisma.deposit.findFirst({
      where: { id: depositId, userId, status: "pending", expiresAt: { gt: new Date() } },
      include: { user: true },
    });

    if (!deposit) {
      throw new Error("درخواست شارژ فعال یا معتبر نیست");
    }

    const updatedDeposit = await prisma.deposit.update({
      where: { id: deposit.id },
      data: { receipt, status: "submitted" },
      include: { user: true },
    });

    await notificationService.notifyAdmins({
      text: `💳 رسید شارژ جدید\n\nکاربر: ${updatedDeposit.user.telegramId}\nمبلغ: ${updatedDeposit.amount.toLocaleString("fa-IR")} تومان\nارز: ${updatedDeposit.cryptoType.toUpperCase()}\nشناسه: ${updatedDeposit.id}`,
      photo: receipt,
      actions: [
        [
          { text: "✅ تایید", callbackData: `admin:deposit:approve:${updatedDeposit.id}` },
          { text: "❌ رد", callbackData: `admin:deposit:reject:${updatedDeposit.id}` },
        ],
      ],
    });

    eventBus.emit("deposit.receipt.submitted", {
      depositId: updatedDeposit.id,
      userId: updatedDeposit.userId,
      amount: updatedDeposit.amount,
      cryptoType: updatedDeposit.cryptoType,
      receipt,
    });
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

      await notificationService.notifyUser(deposit.userId, `✅ شارژ ${deposit.amount.toLocaleString("fa-IR")} تومانی شما تایید شد.`);
      eventBus.emit("deposit.approved", { depositId: deposit.id, userId: deposit.userId, amount: deposit.amount, adminTelegramId });

      return deposit;
    });
  }

  static async reject(depositId: string, adminTelegramId: string) {
    const deposit = await prisma.deposit.update({ where: { id: depositId }, data: { status: "rejected" } });
    await prisma.auditLog.create({
      data: { actorId: adminTelegramId, action: "deposit.reject", metadata: JSON.stringify({ depositId }) },
    });
    await notificationService.notifyUser(deposit.userId, "❌ رسید شارژ شما رد شد.");
    eventBus.emit("deposit.rejected", { depositId: deposit.id, userId: deposit.userId, adminTelegramId });
    return deposit;
  }
}
