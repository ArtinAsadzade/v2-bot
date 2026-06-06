"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DepositService = exports.DEPOSIT_WALLETS = void 0;
const prisma_1 = require("../../services/prisma");
const wallet_service_1 = require("../wallet/wallet.service");
const notification_service_1 = require("../../services/notification.service");
const event_bus_service_1 = require("../../services/event-bus.service");
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
        const deposit = await prisma_1.prisma.deposit.create({
            data: {
                userId,
                amount,
                cryptoType,
                wallet: exports.DEPOSIT_WALLETS[cryptoType],
                status: "pending",
                expiresAt,
            },
        });
        event_bus_service_1.eventBus.emit("deposit.created", { depositId: deposit.id, userId, amount, cryptoType, wallet: deposit.wallet });
        return deposit;
    }
    static async submitReceipt(depositId, userId, receipt) {
        const deposit = await prisma_1.prisma.deposit.findFirst({
            where: { id: depositId, userId, status: "pending", expiresAt: { gt: new Date() } },
            include: { user: true },
        });
        if (!deposit) {
            throw new Error("درخواست شارژ فعال یا معتبر نیست");
        }
        const updatedDeposit = await prisma_1.prisma.deposit.update({
            where: { id: deposit.id },
            data: { receipt, status: "submitted" },
            include: { user: true },
        });
        await notification_service_1.notificationService.notifyAdmins({
            text: `💳 رسید شارژ جدید\n\nکاربر: ${updatedDeposit.user.telegramId}\nمبلغ: ${updatedDeposit.amount.toLocaleString("fa-IR")} تومان\nارز: ${updatedDeposit.cryptoType.toUpperCase()}\nشناسه: ${updatedDeposit.id}`,
            photo: receipt,
            actions: [
                [
                    { text: "✅ تایید", callbackData: `admin:deposit:approve:${updatedDeposit.id}` },
                    { text: "❌ رد", callbackData: `admin:deposit:reject:${updatedDeposit.id}` },
                ],
            ],
        });
        event_bus_service_1.eventBus.emit("deposit.receipt.submitted", {
            depositId: updatedDeposit.id,
            userId: updatedDeposit.userId,
            amount: updatedDeposit.amount,
            cryptoType: updatedDeposit.cryptoType,
            receipt,
        });
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
            await notification_service_1.notificationService.notifyUser(deposit.userId, `✅ شارژ ${deposit.amount.toLocaleString("fa-IR")} تومانی شما تایید شد.`);
            event_bus_service_1.eventBus.emit("deposit.approved", { depositId: deposit.id, userId: deposit.userId, amount: deposit.amount, adminTelegramId });
            return deposit;
        });
    }
    static async reject(depositId, adminTelegramId) {
        const deposit = await prisma_1.prisma.deposit.update({ where: { id: depositId }, data: { status: "rejected" } });
        await prisma_1.prisma.auditLog.create({
            data: { actorId: adminTelegramId, action: "deposit.reject", metadata: JSON.stringify({ depositId }) },
        });
        await notification_service_1.notificationService.notifyUser(deposit.userId, "❌ رسید شارژ شما رد شد.");
        event_bus_service_1.eventBus.emit("deposit.rejected", { depositId: deposit.id, userId: deposit.userId, adminTelegramId });
        return deposit;
    }
}
exports.DepositService = DepositService;
