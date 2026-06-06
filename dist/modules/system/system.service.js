"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CryptoRateService = exports.SystemSettingsService = exports.STORE_DISABLED_MESSAGE = exports.BLOCKED_USER_MESSAGE = void 0;
const prisma_1 = require("../../services/prisma");
const notification_service_1 = require("../../services/notification.service");
const logger_1 = require("../../services/logger");
const STORE_STATUS_CACHE_TTL_MS = 30000;
const USER_STATUS_CACHE_TTL_MS = 15000;
exports.BLOCKED_USER_MESSAGE = "⛔ حساب کاربری شما مسدود شده است.";
exports.STORE_DISABLED_MESSAGE = "🚧 فروشگاه موقتاً غیرفعال است.";
let storeStatusCache;
const userStatusCache = new Map();
class SystemSettingsService {
    static async getFinancialSettingsCached() {
        if (storeStatusCache && storeStatusCache.expiresAt > Date.now())
            return storeStatusCache.status;
        const setting = await prisma_1.prisma.financialSetting.upsert({ where: { id: "singleton" }, update: {}, create: { id: "singleton" } });
        storeStatusCache = { status: setting.storeStatus, expiresAt: Date.now() + STORE_STATUS_CACHE_TTL_MS };
        return setting.storeStatus;
    }
    static async setStoreStatus(status, actorId) {
        const setting = await prisma_1.prisma.financialSetting.upsert({ where: { id: "singleton" }, update: { storeStatus: status }, create: { id: "singleton", storeStatus: status } });
        this.invalidateStoreStatusCache();
        await prisma_1.prisma.auditLog.create({ data: { actorId, action: "store.status.update", metadata: JSON.stringify({ status }) } });
        return setting;
    }
    static invalidateStoreStatusCache() {
        storeStatusCache = undefined;
    }
    static async userAccessByTelegramId(telegramId) {
        const cached = userStatusCache.get(telegramId);
        if (cached && cached.expiresAt > Date.now())
            return cached;
        const user = await prisma_1.prisma.user.findUnique({ where: { telegramId }, select: { isBanned: true, role: true } });
        const state = { isBanned: user?.isBanned ?? false, role: user?.role ?? "user", expiresAt: Date.now() + USER_STATUS_CACHE_TTL_MS };
        userStatusCache.set(telegramId, state);
        return state;
    }
    static invalidateUserStatus(telegramId) {
        if (telegramId)
            userStatusCache.delete(telegramId);
        else
            userStatusCache.clear();
    }
}
exports.SystemSettingsService = SystemSettingsService;
const SUPPORTED_COINS = ["USDT", "BTC", "ETH", "TON", "TRX"];
const COINGECKO_IDS = { USDT: "tether", BTC: "bitcoin", ETH: "ethereum", TON: "the-open-network", TRX: "tron" };
const rateCache = new Map();
let lastAdminRateAlertAt = 0;
function normalizeCoin(coin) {
    const normalized = coin.trim().toUpperCase();
    if (!SUPPORTED_COINS.includes(normalized))
        throw new Error("رمز ارز پشتیبانی نمی‌شود");
    return normalized;
}
class CryptoRateService {
    static supportedCoins() {
        return [...SUPPORTED_COINS];
    }
    static async getRateToman(coin) {
        const normalized = normalizeCoin(coin);
        const cached = rateCache.get(normalized);
        if (cached && Date.now() - cached.fetchedAt.getTime() < 5 * 60000)
            return cached;
        try {
            const fresh = await this.fetchRates([normalized]).then((rates) => rates[0]);
            rateCache.set(normalized, fresh);
            await prisma_1.prisma.cryptoWallet.updateMany({ where: { coinName: normalized }, data: { rateToman: Math.round(fresh.toman), lastRateAt: fresh.fetchedAt } });
            return fresh;
        }
        catch (error) {
            logger_1.logger.error("Crypto provider unavailable", { coin: normalized, error: error instanceof Error ? error.message : String(error) });
            const fallback = cached ?? (await this.getDbFallback(normalized));
            if (fallback) {
                await this.notifyAdminsProviderUnavailable(normalized);
                return { ...fallback, stale: true };
            }
            throw new Error("دریافت نرخ رمز ارز فعلاً ممکن نیست و نرخ ذخیره‌شده‌ای وجود ندارد");
        }
    }
    static async refreshAll() {
        const wallets = await prisma_1.prisma.cryptoWallet.findMany({ where: { status: "active" }, select: { coinName: true } });
        const coins = [...new Set(wallets.map((wallet) => wallet.coinName.toUpperCase()).filter((coin) => SUPPORTED_COINS.includes(coin)))];
        if (!coins.length)
            return [];
        try {
            const rates = await this.fetchRates(coins);
            await Promise.all(rates.map((rate) => {
                rateCache.set(rate.coin, rate);
                return prisma_1.prisma.cryptoWallet.updateMany({ where: { coinName: rate.coin }, data: { rateToman: Math.round(rate.toman), lastRateAt: rate.fetchedAt } });
            }));
            return rates;
        }
        catch (error) {
            logger_1.logger.error("Crypto rate refresh failed", { error: error instanceof Error ? error.message : String(error) });
            await this.notifyAdminsProviderUnavailable(coins.join(", "));
            return coins.map((coin) => rateCache.get(coin)).filter((rate) => Boolean(rate));
        }
    }
    static async fetchRates(coins) {
        const ids = coins.map((coin) => COINGECKO_IDS[coin]).join(",");
        const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`);
        if (!response.ok)
            throw new Error(`Coingecko returned ${response.status}`);
        const prices = await response.json();
        const usdToman = Number(process.env.USD_TOMAN_RATE ?? process.env.USDT_TOMAN_RATE ?? 60000);
        if (!Number.isFinite(usdToman) || usdToman <= 0)
            throw new Error("USD_TOMAN_RATE is invalid");
        const fetchedAt = new Date();
        return coins.map((coin) => {
            const usd = prices[COINGECKO_IDS[coin]]?.usd;
            if (!usd || usd <= 0)
                throw new Error(`Missing price for ${coin}`);
            return { coin, usd, usdToman, toman: usd * usdToman, fetchedAt, source: "coingecko", stale: false };
        });
    }
    static async getDbFallback(coin) {
        const wallet = await prisma_1.prisma.cryptoWallet.findFirst({ where: { coinName: coin, rateToman: { gt: 0 } }, orderBy: { updatedAt: "desc" } });
        if (!wallet)
            return undefined;
        return { coin, usd: 0, usdToman: 0, toman: wallet.rateToman, fetchedAt: wallet.lastRateAt ?? wallet.updatedAt, source: "database", stale: true };
    }
    static async notifyAdminsProviderUnavailable(coin) {
        if (Date.now() - lastAdminRateAlertAt < 30 * 60000)
            return;
        lastAdminRateAlertAt = Date.now();
        await notification_service_1.notificationService.notifyAdmins(`⚠️ دریافت نرخ خودکار رمز ارز (${coin}) ناموفق بود. آخرین نرخ کش‌شده استفاده می‌شود.`);
    }
}
exports.CryptoRateService = CryptoRateService;
