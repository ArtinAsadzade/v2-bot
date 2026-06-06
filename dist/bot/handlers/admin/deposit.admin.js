"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WalletService = void 0;
const prisma_1 = require("../../../services/prisma");
class WalletService {
    static async credit(userId, amount, reason) {
        return prisma_1.prisma.user.update({
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
    static async debit(userId, amount, reason) {
        return prisma_1.prisma.user.update({
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
    static async getBalance(userId) {
        const user = await prisma_1.prisma.user.findUnique({
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
exports.WalletService = WalletService;
