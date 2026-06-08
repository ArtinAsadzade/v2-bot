import { prisma } from "../../services/prisma";
import type { Prisma } from "@prisma/client";

type TxClient = Prisma.TransactionClient;
type DbClient = TxClient | typeof prisma;

type WalletMutationOptions = {
  actorId?: string;
  referenceId?: string;
};

function assertPositiveAmount(amount: number) {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error("Amount must be a positive integer");
  }
}

async function auditWallet(tx: DbClient, data: { actorId: string; userId: string; action: string; amount: number; balanceBefore: number; balanceAfter: number; description: string; referenceId?: string }) {
  await tx.auditLog.create({
    data: {
      actorId: data.actorId,
      action: data.action,
      metadata: JSON.stringify({ userId: data.userId, amount: data.amount, balanceBefore: data.balanceBefore, balanceAfter: data.balanceAfter, description: data.description, referenceId: data.referenceId }),
    },
  });
}

export class WalletService {
  static async getBalance(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { balance: true } });
    return user?.balance ?? 0;
  }

  static async credit(userId: string, amount: number, description: string, tx: TxClient = prisma, options: WalletMutationOptions = {}) {
    assertPositiveAmount(amount);

    const user = await tx.user.update({ where: { id: userId }, data: { balance: { increment: amount } } });
    const balanceAfter = user.balance;
    const balanceBefore = balanceAfter - amount;

    await tx.walletTransaction.create({ data: { userId, amount, type: "credit", description } });
    await auditWallet(tx, { actorId: options.actorId ?? userId, userId, action: "wallet.credit", amount, balanceBefore, balanceAfter, description, referenceId: options.referenceId });

    return user;
  }

  static async debit(userId: string, amount: number, description: string, tx: TxClient = prisma, options: WalletMutationOptions = {}) {
    assertPositiveAmount(amount);

    const updated = await tx.user.updateMany({ where: { id: userId, balance: { gte: amount } }, data: { balance: { decrement: amount } } });
    if (updated.count !== 1) throw new Error("موجودی کیف پول کافی نیست");

    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    const balanceAfter = user.balance;
    const balanceBefore = balanceAfter + amount;

    await tx.walletTransaction.create({ data: { userId, amount, type: "debit", description } });
    await auditWallet(tx, { actorId: options.actorId ?? userId, userId, action: "wallet.debit", amount, balanceBefore, balanceAfter, description, referenceId: options.referenceId });

    return user;
  }

  static async transfer(fromUserId: string, toUserId: string, amount: number, description: string) {
    assertPositiveAmount(amount);
    if (fromUserId === toUserId) throw new Error("Cannot transfer to the same wallet");

    return prisma.$transaction(async (tx) => {
      const debited = await tx.user.updateMany({ where: { id: fromUserId, balance: { gte: amount } }, data: { balance: { decrement: amount } } });
      if (debited.count !== 1) throw new Error("موجودی کیف پول کافی نیست");

      const sender = await tx.user.findUniqueOrThrow({ where: { id: fromUserId } });
      const receiver = await tx.user.update({ where: { id: toUserId }, data: { balance: { increment: amount } } });

      await tx.walletTransaction.create({ data: { userId: fromUserId, amount, type: "transfer_out", description } });
      await tx.walletTransaction.create({ data: { userId: toUserId, amount, type: "transfer_in", description } });
      await auditWallet(tx, { actorId: fromUserId, userId: fromUserId, action: "wallet.transfer_out", amount, balanceBefore: sender.balance + amount, balanceAfter: sender.balance, description, referenceId: `transfer:${toUserId}` });
      await auditWallet(tx, { actorId: fromUserId, userId: toUserId, action: "wallet.transfer_in", amount, balanceBefore: receiver.balance - amount, balanceAfter: receiver.balance, description, referenceId: `transfer:${fromUserId}` });

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
    return prisma.$transaction((tx) => WalletService.credit(userId, amount, reason, tx, { actorId: "system", referenceId: reason }));
  }
}
