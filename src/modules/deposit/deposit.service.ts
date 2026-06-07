import { prisma } from "../../services/prisma";
import { WalletService } from "../wallet/wallet.service";
import { notificationService } from "../../services/notification.service";
import { eventBus } from "../../services/event-bus.service";
import { CryptoRateService } from "../system/system.service";

const DEFAULT_MINIMUM_TOPUP = 100_000;
const CRYPTO_DECIMALS = 8;

export type DepositQuote = {
  amount: number;
  cryptoAmount: number;
  exchangeRate: number;
  coinUsdPrice: number;
  usdTomanRate: number;
  rateSource: string;
  stale: boolean;
  wallet: {
    id: string;
    coinName: string;
    walletAddress: string;
    networkName: string;
  };
};

function assertPositiveToman(amount: number) {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error("مبلغ شارژ معتبر نیست");
}

function roundCrypto(value: number) {
  return Number(value.toFixed(CRYPTO_DECIMALS));
}

export class FinancialSettingsService {
  static async get() {
    return prisma.financialSetting.upsert({
      where: { id: "singleton" },
      update: {},
      create: { id: "singleton", minimumTopupAmount: DEFAULT_MINIMUM_TOPUP },
    });
  }

  static async setMinimumTopupAmount(amount: number, actorId: string) {
    assertPositiveToman(amount);
    const setting = await prisma.financialSetting.upsert({
      where: { id: "singleton" },
      update: { minimumTopupAmount: amount },
      create: { id: "singleton", minimumTopupAmount: amount },
    });
    await prisma.auditLog.create({ data: { actorId, action: "financial.minimum_topup.update", metadata: JSON.stringify({ amount }) } });
    return setting;
  }

  static async validateTopupAmount(amount: number) {
    assertPositiveToman(amount);
    const setting = await this.get();
    if (amount < setting.minimumTopupAmount) {
      throw new Error(`حداقل شارژ کیف پول ${setting.minimumTopupAmount.toLocaleString("fa-IR")} تومان است`);
    }
    return setting;
  }
}

export class CryptoWalletService {
  static supportedCoins() {
    return CryptoRateService.supportedCoins();
  }

  static async listActive() {
    return prisma.cryptoWallet.findMany({ where: { status: "active" }, orderBy: [{ displayOrder: "asc" }, { coinName: "asc" }, { networkName: "asc" }] });
  }

  static async listAll() {
    return prisma.cryptoWallet.findMany({ orderBy: [{ status: "asc" }, { coinName: "asc" }, { networkName: "asc" }] });
  }

  static async upsert(data: { coinName: string; coinSymbol?: string; networkName: string; displayName?: string; walletAddress: string; displayOrder?: number; status?: "active" | "inactive" }, actorId: string) {
    const coinName = data.coinName.trim().toUpperCase();
    const networkName = data.networkName.trim().toUpperCase();
    const walletAddress = data.walletAddress.trim();
    const coinSymbol = (data.coinSymbol ?? coinName).trim().toUpperCase();
    const displayName = data.displayName?.trim() || `${coinName} ${networkName}`;
    const displayOrder = data.displayOrder ?? 0;
    if (!coinName || !networkName || !walletAddress) throw new Error("اطلاعات کیف پول کامل نیست");
    if (!CryptoRateService.supportedCoins().includes(coinName as never)) throw new Error("رمز ارز پشتیبانی نمی‌شود");
    const rate = await CryptoRateService.getRateToman(coinName).catch(() => undefined);
    const wallet = await prisma.cryptoWallet.upsert({
      where: { coinName_networkName: { coinName, networkName } },
      update: { walletAddress, coinSymbol, displayName, displayOrder, status: data.status ?? "active", ...(rate ? { rateToman: Math.round(rate.toman), lastRateAt: rate.fetchedAt } : {}) },
      create: { coinName, coinSymbol, networkName, displayName, displayOrder, walletAddress, status: data.status ?? "active", rateToman: rate ? Math.round(rate.toman) : 0, lastRateAt: rate?.fetchedAt },
    });
    await prisma.auditLog.create({ data: { actorId, action: "crypto_wallet.upsert", metadata: JSON.stringify({ walletId: wallet.id, coinName, networkName }) } });
    return wallet;
  }

  static async setStatus(walletId: string, status: "active" | "inactive", actorId: string) {
    const wallet = await prisma.cryptoWallet.update({ where: { id: walletId }, data: { status } });
    await prisma.auditLog.create({ data: { actorId, action: "crypto_wallet.status", metadata: JSON.stringify({ walletId, status }) } });
    return wallet;
  }

  static async quote(walletId: string, amount: number): Promise<DepositQuote> {
    await FinancialSettingsService.validateTopupAmount(amount);
    const wallet = await prisma.cryptoWallet.findFirst({ where: { id: walletId, status: "active" } });
    if (!wallet) throw new Error("کیف پول انتخابی فعال نیست");
    const rate = await CryptoRateService.getRateToman(wallet.coinName);
    const exchangeRate = Math.round(rate.toman);
    if (exchangeRate <= 0) throw new Error("نرخ این رمز ارز در دسترس نیست");
    return {
      amount,
      exchangeRate,
      coinUsdPrice: rate.usd,
      usdTomanRate: rate.usdToman,
      rateSource: rate.source,
      stale: rate.stale,
      cryptoAmount: roundCrypto(amount / exchangeRate),
      wallet: { id: wallet.id, coinName: wallet.coinName, networkName: wallet.networkName, walletAddress: wallet.walletAddress },
    };
  }
}

export class DepositService {
  static async createDeposit(userId: string, amount: number, cryptoWalletId: string) {
    const quote = await CryptoWalletService.quote(cryptoWalletId, amount);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    const deposit = await prisma.deposit.create({
      data: {
        userId,
        amount,
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

    eventBus.emit("deposit.created", { depositId: deposit.id, userId, amount, cryptoType: deposit.cryptoType, wallet: deposit.wallet, networkName: deposit.networkName });
    return deposit;
  }

  static async submitReceipt(depositId: string, userId: string, receipt: string) {
    const deposit = await prisma.deposit.findFirst({
      where: { id: depositId, userId, status: "pending", expiresAt: { gt: new Date() } },
      include: { user: true },
    });

    if (!deposit) throw new Error("درخواست شارژ فعال یا معتبر نیست");

    const updatedDeposit = await prisma.deposit.update({ where: { id: deposit.id }, data: { receipt, status: "submitted" }, include: { user: true } });

    await notificationService.notifyAdmins({
      text: `💳 رسید شارژ جدید\n\nکاربر: ${updatedDeposit.user.telegramId}\nمبلغ: ${updatedDeposit.amount.toLocaleString("fa-IR")} تومان\nرمز ارز: ${updatedDeposit.cryptoType}\nشبکه: ${updatedDeposit.networkName ?? "-"}\nمبلغ کریپتو: ${updatedDeposit.cryptoAmount ?? "-"}\nشناسه: ${updatedDeposit.id}`,
      photo: receipt,
      actions: [[{ text: "✅ تایید", callbackData: `admin:deposit:approve:${updatedDeposit.id}` }, { text: "❌ رد", callbackData: `admin:deposit:reject:${updatedDeposit.id}` }]],
    });

    eventBus.emit("deposit.receipt.submitted", { depositId: updatedDeposit.id, userId: updatedDeposit.userId, amount: updatedDeposit.amount, cryptoType: updatedDeposit.cryptoType, receipt });
  }

  static async approve(depositId: string, adminTelegramId: string) {
    return prisma.$transaction(async (tx) => {
      const deposit = await tx.deposit.findUnique({ where: { id: depositId } });
      if (!deposit) throw new Error("درخواست شارژ پیدا نشد");
      if (deposit.status !== "submitted") throw new Error("⚠️ این پرداخت قبلاً تعیین وضعیت شده است.");

      const now = new Date();
      const approved = await tx.deposit.updateMany({ where: { id: depositId, status: "submitted" }, data: { status: "approved", reviewedBy: adminTelegramId, reviewedAt: now, reviewAction: "APPROVED" } });
      if (approved.count !== 1) throw new Error("⚠️ این پرداخت قبلاً تعیین وضعیت شده است.");
      await WalletService.credit(deposit.userId, deposit.amount, `تایید شارژ ${deposit.id}`, tx);
      await tx.auditLog.create({ data: { actorId: adminTelegramId, action: "deposit.approve", metadata: JSON.stringify({ depositId, action: "APPROVED", reviewedAt: now.toISOString() }) } });

      await notificationService.notifyUser(deposit.userId, `✅ شارژ ${deposit.amount.toLocaleString("fa-IR")} تومانی شما تایید شد.`);
      eventBus.emit("deposit.approved", { depositId: deposit.id, userId: deposit.userId, amount: deposit.amount, adminTelegramId });
      return deposit;
    });
  }

  static async reject(depositId: string, adminTelegramId: string) {
    const deposit = await prisma.$transaction(async (tx) => {
      const current = await tx.deposit.findUnique({ where: { id: depositId } });
      if (!current) throw new Error("درخواست شارژ پیدا نشد");
      if (current.status !== "submitted") throw new Error("⚠️ این پرداخت قبلاً تعیین وضعیت شده است.");
      const now = new Date();
      const rejected = await tx.deposit.updateMany({ where: { id: depositId, status: "submitted" }, data: { status: "rejected", reviewedBy: adminTelegramId, reviewedAt: now, reviewAction: "REJECTED" } });
      if (rejected.count !== 1) throw new Error("⚠️ این پرداخت قبلاً تعیین وضعیت شده است.");
      await tx.auditLog.create({ data: { actorId: adminTelegramId, action: "deposit.reject", metadata: JSON.stringify({ depositId, action: "REJECTED", reviewedAt: now.toISOString() }) } });
      return current;
    });
    await notificationService.notifyUser(deposit.userId, "❌ رسید شارژ شما رد شد.");
    eventBus.emit("deposit.rejected", { depositId: deposit.id, userId: deposit.userId, adminTelegramId });
    return deposit;
  }
}
