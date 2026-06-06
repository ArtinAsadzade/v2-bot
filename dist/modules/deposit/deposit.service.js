"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DepositService = void 0;
const prisma_1 = require("../../services/prisma");
class DepositService {
    static async createDeposit(userId, amount, cryptoType, wallet) {
        const expiresAt = new Date();
        expiresAt.setMinutes(expiresAt.getMinutes() + 30);
        return prisma_1.prisma.deposit.create({
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
exports.DepositService = DepositService;
