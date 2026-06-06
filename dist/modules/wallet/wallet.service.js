"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WalletService = void 0;
const prisma_1 = require("../../services/prisma");
function assertPositiveAmount(amount) {
    if (!Number.isInteger(amount) || amount <= 0) {
        throw new Error("Amount must be a positive integer");
    }
}
class WalletService {
    static async getBalance(userId) {
        const user = await prisma_1.prisma.user.findUnique({ where: { id: userId }, select: { balance: true } });
        return user?.balance ?? 0;
    }
    static async credit(userId, amount, description, tx = prisma_1.prisma) {
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
    static async debit(userId, amount, description, tx = prisma_1.prisma) {
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
    static async transfer(fromUserId, toUserId, amount, description) {
        assertPositiveAmount(amount);
        if (fromUserId === toUserId) {
            throw new Error("Cannot transfer to the same wallet");
        }
        return prisma_1.prisma.$transaction(async (tx) => {
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
    static addBalance(userId, amount, reason) {
        return WalletService.credit(userId, amount, reason);
    }
    static subtractBalance(userId, amount, reason) {
        return WalletService.debit(userId, amount, reason);
    }
    static creditFromDeposit(userId, amount, reason) {
        return prisma_1.prisma.$transaction((tx) => WalletService.credit(userId, amount, reason, tx));
    }
}
exports.WalletService = WalletService;
