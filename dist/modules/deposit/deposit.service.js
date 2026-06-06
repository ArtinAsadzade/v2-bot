"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DepositService = exports.DEPOSIT_WALLETS = void 0;
const prisma_1 = require("../../services/prisma");
const wallet_service_1 = require("../wallet/wallet.service");
exports.DEPOSIT_WALLETS = {
    usdt: process.env.USDT_WALLET_ADDRESS ?? "TRC20_WALLET_ADDRESS",
    btc: process.env.BTC_WALLET_ADDRESS ?? "BTC_WALLET_ADDRESS",
};
class DepositService {
    static async createDeposit(userId, amount, cryptoType) {
        if (!Number.isInteger(amount) || amount <= 0) {
            throw new Error("مبلغ شارژ معتبر نیست");
        }
        const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
        return prisma_1.prisma.deposit.create({
            data: {
                userId,
                amount,
                cryptoType,
                wallet: exports.DEPOSIT_WALLETS[cryptoType],
                status: "pending",
                expiresAt,
            },
        });
    }
    static async submitReceipt(depositId, userId, receipt) {
        const updated = await prisma_1.prisma.deposit.updateMany({
            where: { id: depositId, userId, status: "pending", expiresAt: { gt: new Date() } },
            data: { receipt, status: "submitted" },
        });
        if (updated.count !== 1) {
            throw new Error("درخواست شارژ فعال یا معتبر نیست");
        }
    }
    static async approve(depositId, adminTelegramId) {
        return prisma_1.prisma.$transaction(async (tx) => {
            const deposit = await tx.deposit.findUnique({ where: { id: depositId } });
            if (!deposit || deposit.status !== "submitted") {
                throw new Error("درخواست شارژ قابل تایید نیست");
            }
            await tx.deposit.update({ where: { id: depositId }, data: { status: "approved" } });
            await wallet_service_1.WalletService.credit(deposit.userId, deposit.amount, `تایید شارژ ${deposit.id}`, tx);
            await tx.auditLog.create({
                data: { actorId: adminTelegramId, action: "deposit.approve", metadata: JSON.stringify({ depositId }) },
            });
            return deposit;
        });
    }
    static async reject(depositId, adminTelegramId) {
        const deposit = await prisma_1.prisma.deposit.update({ where: { id: depositId }, data: { status: "rejected" } });
        await prisma_1.prisma.auditLog.create({
            data: { actorId: adminTelegramId, action: "deposit.reject", metadata: JSON.stringify({ depositId }) },
        });
        return deposit;
    }
}
exports.DepositService = DepositService;
