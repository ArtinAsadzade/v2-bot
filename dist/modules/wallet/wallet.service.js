"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WalletService = void 0;
const prisma_1 = require("../../services/prisma");
class WalletService {
    static async getBalance(userId) {
        const user = await prisma_1.prisma.user.findUnique({
            where: { id: userId },
        });
        return user?.balance || 0;
    }
    static async addBalance(userId, amount, reason) {
        return prisma_1.prisma.$transaction(async (tx) => {
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
    static async subtractBalance(userId, amount, reason) {
        return prisma_1.prisma.$transaction(async (tx) => {
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
    static async creditFromDeposit(userId, amount, reason) {
        return prisma_1.prisma.$transaction(async (tx) => {
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
exports.WalletService = WalletService;
