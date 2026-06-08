"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DepositService = exports.CryptoWalletService = exports.FinancialSettingsService = void 0;
const prisma_1 = require("../../services/prisma");
const payment_service_1 = require("../payment/payment.service");
const notification_service_1 = require("../../services/notification.service");
const event_bus_service_1 = require("../../services/event-bus.service");
const system_service_1 = require("../system/system.service");
const DEFAULT_MINIMUM_TOPUP = 100000;
const CRYPTO_DECIMALS = 8;
const CRYPTO_DECIMAL_FACTOR = 10 ** CRYPTO_DECIMALS;
function assertPositiveToman(amount) {
    if (!Number.isInteger(amount) || amount <= 0)
        throw new Error("مبلغ شارژ معتبر نیست");
}
function roundCrypto(value) {
    if (!Number.isFinite(value) || value <= 0)
        throw new Error("مبلغ رمز ارز معتبر نیست");
    return Math.ceil(value * CRYPTO_DECIMAL_FACTOR) / CRYPTO_DECIMAL_FACTOR;
}
function finalTomanAmount(amount, cryptoAmount, exchangeRate) {
    const finalAmount = Math.round(cryptoAmount * exchangeRate);
    if (!Number.isInteger(finalAmount) || finalAmount < amount)
        return amount;
    return finalAmount;
}
class FinancialSettingsService {
    static async get() {
        return prisma_1.prisma.financialSetting.upsert({
            where: { id: "singleton" },
            update: {},
            create: { id: "singleton", minimumTopupAmount: DEFAULT_MINIMUM_TOPUP },
        });
    }
    static async setMinimumTopupAmount(amount, actorId) {
        assertPositiveToman(amount);
        const setting = await prisma_1.prisma.financialSetting.upsert({
            where: { id: "singleton" },
            update: { minimumTopupAmount: amount },
            create: { id: "singleton", minimumTopupAmount: amount },
        });
        await prisma_1.prisma.auditLog.create({ data: { actorId, action: "financial.minimum_topup.update", metadata: JSON.stringify({ amount }) } });
        return setting;
    }
    static async validateTopupAmount(amount) {
        assertPositiveToman(amount);
        const setting = await this.get();
        if (amount < setting.minimumTopupAmount) {
            throw new Error(`حداقل شارژ کیف پول ${setting.minimumTopupAmount.toLocaleString("fa-IR")} تومان است`);
        }
        return setting;
    }
}
exports.FinancialSettingsService = FinancialSettingsService;
function normalizeCryptoWalletInput(data) {
    const coinName = data.coinName.trim().toUpperCase();
    const networkName = data.networkName.trim().toUpperCase();
    const walletAddress = data.walletAddress.trim();
    const coinSymbol = (data.coinSymbol ?? coinName).trim().toUpperCase();
    const displayName = data.displayName?.trim() || `${coinName} ${networkName}`;
    const displayOrder = data.displayOrder ?? 0;
    const status = data.status ?? "active";
    if (!coinName || !coinSymbol || !networkName || !walletAddress)
        throw new Error("اطلاعات کیف پول کامل نیست");
    if (!system_service_1.CryptoRateService.supportedCoins().includes(coinName))
        throw new Error("رمز ارز پشتیبانی نمی‌شود");
    return { coinName, coinSymbol, networkName, displayName, displayOrder, walletAddress, status };
}
class CryptoWalletService {
    static supportedCoins() {
        return system_service_1.CryptoRateService.supportedCoins();
    }
    static async listActive() {
        return prisma_1.prisma.cryptoWallet.findMany({ where: { status: "active" }, orderBy: [{ displayOrder: "asc" }, { coinName: "asc" }, { networkName: "asc" }] });
    }
    static async listAll() {
        return prisma_1.prisma.cryptoWallet.findMany({ orderBy: [{ status: "asc" }, { coinName: "asc" }, { networkName: "asc" }] });
    }
    static async get(walletId) {
        return prisma_1.prisma.cryptoWallet.findUnique({ where: { id: walletId } });
    }
    static async getUsage(walletId) {
        const [pendingDeposits, submittedDeposits, deposits] = await Promise.all([
            prisma_1.prisma.deposit.count({ where: { cryptoWalletId: walletId, status: "pending" } }),
            prisma_1.prisma.deposit.count({ where: { cryptoWalletId: walletId, status: "submitted" } }),
            prisma_1.prisma.deposit.count({ where: { cryptoWalletId: walletId } }),
        ]);
        const activePayments = pendingDeposits + submittedDeposits;
        return { pendingDeposits, submittedDeposits, activePayments, deposits };
    }
    static async create(data, actorId) {
        const payload = normalizeCryptoWalletInput(data);
        const rate = await system_service_1.CryptoRateService.getRateToman(payload.coinName).catch(() => undefined);
        const wallet = await prisma_1.prisma.cryptoWallet.create({
            data: { ...payload, rateToman: rate ? Math.round(rate.toman) : 0, lastRateAt: rate?.fetchedAt },
        });
        await prisma_1.prisma.auditLog.create({ data: { actorId, action: "crypto_wallet.create", metadata: JSON.stringify({ walletId: wallet.id, coinName: wallet.coinName, symbol: wallet.coinSymbol, networkName: wallet.networkName }) } });
        return wallet;
    }
    static async update(walletId, data, actorId) {
        const current = await prisma_1.prisma.cryptoWallet.findUnique({ where: { id: walletId } });
        if (!current)
            throw new Error("کیف پول پیدا نشد");
        const payload = normalizeCryptoWalletInput({
            coinName: data.coinName ?? current.coinName,
            coinSymbol: data.coinSymbol ?? current.coinSymbol ?? current.coinName,
            networkName: data.networkName ?? current.networkName,
            displayName: data.displayName ?? current.displayName ?? undefined,
            walletAddress: data.walletAddress ?? current.walletAddress,
            displayOrder: data.displayOrder ?? current.displayOrder,
            status: data.status ?? current.status,
        });
        const rate = payload.coinName !== current.coinName ? await system_service_1.CryptoRateService.getRateToman(payload.coinName).catch(() => undefined) : undefined;
        const wallet = await prisma_1.prisma.cryptoWallet.update({
            where: { id: walletId },
            data: { ...payload, ...(rate ? { rateToman: Math.round(rate.toman), lastRateAt: rate.fetchedAt } : {}) },
        });
        await prisma_1.prisma.auditLog.create({ data: { actorId, action: "crypto_wallet.update", metadata: JSON.stringify({ walletId, coinName: wallet.coinName, symbol: wallet.coinSymbol, networkName: wallet.networkName }) } });
        return wallet;
    }
    static async upsert(data, actorId) {
        const payload = normalizeCryptoWalletInput(data);
        const existing = await prisma_1.prisma.cryptoWallet.findUnique({ where: { coinName_networkName: { coinName: payload.coinName, networkName: payload.networkName } } });
        return existing ? this.update(existing.id, payload, actorId) : this.create(payload, actorId);
    }
    static async setStatus(walletId, status, actorId) {
        const wallet = await prisma_1.prisma.cryptoWallet.update({ where: { id: walletId }, data: { status } });
        await prisma_1.prisma.auditLog.create({ data: { actorId, action: status === "active" ? "crypto_wallet.enable" : "crypto_wallet.disable", metadata: JSON.stringify({ walletId, status }) } });
        return wallet;
    }
    static enable(walletId, actorId) {
        return this.setStatus(walletId, "active", actorId);
    }
    static disable(walletId, actorId) {
        return this.setStatus(walletId, "inactive", actorId);
    }
    static async delete(walletId, actorId) {
        const wallet = await prisma_1.prisma.cryptoWallet.findUnique({ where: { id: walletId } });
        if (!wallet)
            throw new Error("کیف پول پیدا نشد");
        const usage = await this.getUsage(walletId);
        if (usage.activePayments > 0) {
            throw new Error("این کیف پول در پرداخت فعال استفاده شده است. ابتدا پرداخت‌های در انتظار یا ارسال‌شده را تعیین وضعیت کنید");
        }
        const deleted = await prisma_1.prisma.cryptoWallet.delete({ where: { id: walletId } });
        await prisma_1.prisma.auditLog.create({ data: { actorId, action: "crypto_wallet.delete", metadata: JSON.stringify({ walletId, activePayments: usage.activePayments, deposits: usage.deposits }) } });
        return deleted;
    }
    static async quote(walletId, amount) {
        await FinancialSettingsService.validateTopupAmount(amount);
        const wallet = await prisma_1.prisma.cryptoWallet.findFirst({ where: { id: walletId, status: "active" } });
        if (!wallet)
            throw new Error("کیف پول انتخابی فعال نیست");
        const rate = await system_service_1.CryptoRateService.getRateToman(wallet.coinName);
        const exchangeRate = Math.round(rate.toman);
        if (!Number.isInteger(exchangeRate) || exchangeRate <= 0)
            throw new Error("نرخ این رمز ارز در دسترس نیست");
        const cryptoAmount = roundCrypto(amount / exchangeRate);
        return {
            amount: finalTomanAmount(amount, cryptoAmount, exchangeRate),
            exchangeRate,
            coinUsdPrice: rate.usd,
            usdTomanRate: rate.usdToman,
            rateSource: rate.source,
            stale: rate.stale,
            cryptoAmount,
            wallet: { id: wallet.id, coinName: wallet.coinName, networkName: wallet.networkName, walletAddress: wallet.walletAddress },
        };
    }
}
exports.CryptoWalletService = CryptoWalletService;
class DepositService {
    static async createDeposit(userId, amount, cryptoWalletId) {
        const quote = await CryptoWalletService.quote(cryptoWalletId, amount);
        const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
        const deposit = await prisma_1.prisma.deposit.create({
            data: {
                userId,
                amount: quote.amount,
                cryptoType: quote.wallet.coinName,
                wallet: quote.wallet.walletAddress,
                networkName: quote.wallet.networkName,
                cryptoAmount: quote.cryptoAmount,
                exchangeRate: quote.exchangeRate,
                cryptoWalletId: quote.wallet.id,
                status: "pending",
                expiresAt,
            },
        });
        event_bus_service_1.eventBus.emit("deposit.created", { depositId: deposit.id, userId, amount: deposit.amount, cryptoType: deposit.cryptoType, wallet: deposit.wallet, networkName: deposit.networkName });
        return deposit;
    }
    static async submitReceipt(depositId, userId, receipt) {
        const submitted = await prisma_1.prisma.deposit.updateMany({
            where: { id: depositId, userId, status: "pending", expiresAt: { gt: new Date() } },
            data: { receipt, status: "submitted" },
        });
        if (submitted.count !== 1)
            throw new Error("درخواست شارژ فعال یا معتبر نیست");
        const updatedDeposit = await prisma_1.prisma.deposit.findUnique({ where: { id: depositId }, include: { user: true } });
        if (!updatedDeposit || updatedDeposit.userId !== userId || updatedDeposit.status !== "submitted")
            throw new Error("درخواست شارژ فعال یا معتبر نیست");
        await notification_service_1.notificationService.notifyAdmins({
            text: `💳 رسید شارژ جدید\n\nکاربر: ${updatedDeposit.user.telegramId}\nمبلغ: ${updatedDeposit.amount.toLocaleString("fa-IR")} تومان\nرمز ارز: ${updatedDeposit.cryptoType}\nشبکه: ${updatedDeposit.networkName ?? "-"}\nمبلغ کریپتو: ${updatedDeposit.cryptoAmount ?? "-"}\nشناسه: ${updatedDeposit.id}`,
            photo: receipt,
            actions: [[{ text: "✅ تایید", callbackData: `admin:deposit:approve:${updatedDeposit.id}` }, { text: "❌ رد", callbackData: `admin:deposit:reject:${updatedDeposit.id}` }]],
        });
        event_bus_service_1.eventBus.emit("deposit.receipt.submitted", { depositId: updatedDeposit.id, userId: updatedDeposit.userId, amount: updatedDeposit.amount, cryptoType: updatedDeposit.cryptoType, receipt });
    }
    static async approve(depositId, adminTelegramId) {
        const deposit = await prisma_1.prisma.$transaction(async (tx) => {
            const now = new Date();
            const approved = await tx.deposit.updateMany({ where: { id: depositId, status: "submitted" }, data: { status: "approved", reviewedBy: adminTelegramId, reviewedAt: now, reviewAction: "APPROVED" } });
            if (approved.count !== 1)
                throw new Error("⚠️ این پرداخت قبلاً تعیین وضعیت شده است.");
            const deposit = await tx.deposit.findUnique({ where: { id: depositId } });
            if (!deposit)
                throw new Error("درخواست شارژ پیدا نشد");
            await payment_service_1.PaymentService.creditWallet(tx, { userId: deposit.userId, amount: deposit.amount, reason: `تایید شارژ ${deposit.id}`, actorId: adminTelegramId, referenceId: `deposit:${deposit.id}` });
            await tx.auditLog.create({ data: { actorId: adminTelegramId, action: "deposit.approve", metadata: JSON.stringify({ depositId, userId: deposit.userId, amount: deposit.amount, action: "APPROVED", reviewedAt: now.toISOString(), reason: "admin_crypto_receipt_approval" }) } });
            return deposit;
        });
        await notification_service_1.notificationService.notifyUser(deposit.userId, `✅ شارژ ${deposit.amount.toLocaleString("fa-IR")} تومانی شما تایید شد.`);
        event_bus_service_1.eventBus.emit("deposit.approved", { depositId: deposit.id, userId: deposit.userId, amount: deposit.amount, adminTelegramId });
        return deposit;
    }
    static async reject(depositId, adminTelegramId) {
        const deposit = await prisma_1.prisma.$transaction(async (tx) => {
            const current = await tx.deposit.findUnique({ where: { id: depositId } });
            if (!current)
                throw new Error("درخواست شارژ پیدا نشد");
            if (current.status !== "submitted")
                throw new Error("⚠️ این پرداخت قبلاً تعیین وضعیت شده است.");
            const now = new Date();
            const rejected = await tx.deposit.updateMany({ where: { id: depositId, status: "submitted" }, data: { status: "rejected", reviewedBy: adminTelegramId, reviewedAt: now, reviewAction: "REJECTED" } });
            if (rejected.count !== 1)
                throw new Error("⚠️ این پرداخت قبلاً تعیین وضعیت شده است.");
            await tx.auditLog.create({ data: { actorId: adminTelegramId, action: "deposit.reject", metadata: JSON.stringify({ depositId, userId: current.userId, amount: current.amount, action: "REJECTED", reviewedAt: now.toISOString(), reason: "admin_crypto_receipt_rejection" }) } });
            return current;
        });
        await notification_service_1.notificationService.notifyUser(deposit.userId, "❌ رسید شارژ شما رد شد.");
        event_bus_service_1.eventBus.emit("deposit.rejected", { depositId: deposit.id, userId: deposit.userId, adminTelegramId });
        return deposit;
    }
}
exports.DepositService = DepositService;
