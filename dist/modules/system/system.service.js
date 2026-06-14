"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CryptoRateService = exports.SystemSettingsService = exports.STORE_DISABLED_MESSAGE = exports.BLOCKED_USER_MESSAGE = void 0;
const prisma_1 = require("../../services/prisma");
const logger_1 = require("../../services/logger");
const monitoring_service_1 = require("../../services/monitoring.service");
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
const BINANCE_SYMBOLS = { USDT: "USDCUSDT", BTC: "BTCUSDT", ETH: "ETHUSDT", TRX: "TRXUSDT" };
const rateCache = new Map();
let lastAdminRateAlert;
let lastFailedRateUpdateAt;
function envNumber(name, fallback) {
    const raw = process.env[name];
    if (!raw)
        return fallback;
    const parsed = Number(raw.replace(/[,،\s]/g, ""));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
function rateTimeoutMs() { return envNumber("CRYPTO_RATE_TIMEOUT_MS", 8000); }
function alertCooldownMs() { return envNumber("CRYPTO_RATE_ALERT_COOLDOWN_MINUTES", 30) * 60000; }
function staleAfterMs() { return envNumber("CRYPTO_RATE_STALE_AFTER_MINUTES", 360) * 60000; }
function readUsdTomanRate(required = true) {
    const raw = process.env.USD_TOMAN_RATE ?? process.env.USDT_TOMAN_RATE;
    if (!raw) {
        if (required)
            throw new Error("USD_TOMAN_RATE is invalid");
        return undefined;
    }
    const normalized = raw.replace(/[,،\s]/g, "");
    const usdToman = Number(normalized);
    if (!Number.isFinite(usdToman) || usdToman <= 0) {
        if (required)
            throw new Error("USD_TOMAN_RATE is invalid");
        return undefined;
    }
    return usdToman;
}
function toTomanRate(usd, usdToman) {
    if (!Number.isFinite(usd) || usd <= 0)
        throw new Error("USD price is invalid");
    if (!Number.isFinite(usdToman) || usdToman <= 0)
        throw new Error("USD_TOMAN_RATE is invalid");
    const toman = usd * usdToman;
    if (!Number.isFinite(toman) || toman <= 0)
        throw new Error("Toman rate is invalid");
    return toman;
}
function normalizeCoin(coin) {
    const normalized = coin.trim().toUpperCase();
    if (!SUPPORTED_COINS.includes(normalized))
        throw new Error("رمز ارز پشتیبانی نمی‌شود");
    return normalized;
}
async function fetchJsonWithTimeout(url, timeoutMs = rateTimeoutMs()) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok)
            throw new Error(`HTTP ${response.status}`);
        return response.json();
    }
    finally {
        clearTimeout(timeout);
    }
}
function isFresh(rate) {
    return Date.now() - rate.fetchedAt.getTime() <= staleAfterMs();
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
        const rates = await this.resolveRates([normalized]);
        const rate = rates[0];
        if (!rate)
            throw new Error("دریافت نرخ رمز ارز فعلاً ممکن نیست و نرخ جایگزینی وجود ندارد");
        if (!rate.stale)
            await this.persistRates([rate]);
        return rate;
    }
    static async refreshAll() {
        const wallets = await prisma_1.prisma.cryptoWallet.findMany({ where: { status: "active" }, select: { coinName: true } });
        const coins = [...new Set(wallets.map((wallet) => wallet.coinName.toUpperCase()).filter((coin) => SUPPORTED_COINS.includes(coin)))];
        if (!coins.length)
            return [];
        const rates = await this.resolveRates(coins);
        await this.persistRates(rates.filter((rate) => rate.source !== "env"));
        return rates;
    }
    static async resolveRates(coins) {
        logger_1.logger.info("CRYPTO_RATE_FETCH_STARTED", { event: "CRYPTO_RATE_FETCH_STARTED", coins });
        try {
            const rates = await this.tryFetchWithRetry(coins, "coingecko");
            await this.onFetchSuccess(rates);
            return rates;
        }
        catch (primaryError) {
            logger_1.logger.warn("CRYPTO_RATE_FETCH_FAILED", { event: "CRYPTO_RATE_FETCH_FAILED", source: "coingecko", error: primaryError instanceof Error ? primaryError.message : String(primaryError), coins });
            try {
                const rates = await this.tryFetchWithRetry(coins, "binance");
                await this.onFetchSuccess(rates);
                return rates;
            }
            catch (secondaryError) {
                const sample = secondaryError instanceof Error ? secondaryError.message : String(secondaryError);
                lastFailedRateUpdateAt = new Date();
                logger_1.logger.warn("CRYPTO_RATE_FETCH_FAILED", { event: "CRYPTO_RATE_FETCH_FAILED", source: "binance", error: sample, coins });
                const fallbackRates = await this.fallbackRates(coins, sample);
                if (fallbackRates.length)
                    return fallbackRates;
                await this.alertRateFailure("no_fallback", `All crypto rate sources failed; sample=${sample}`);
                return [];
            }
        }
    }
    static async tryFetchWithRetry(coins, source) {
        try {
            return await this.fetchRatesFromSource(coins, source);
        }
        catch (error) {
            await new Promise((resolve) => setTimeout(resolve, 350));
            return this.fetchRatesFromSource(coins, source);
        }
    }
    static async fetchRatesFromSource(coins, source) {
        if (source === "coingecko")
            return this.fetchCoingeckoRates(coins);
        return this.fetchBinanceRates(coins);
    }
    static async fetchCoingeckoRates(coins) {
        const ids = coins.map((coin) => COINGECKO_IDS[coin]).join(",");
        const prices = await fetchJsonWithTimeout(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`);
        const usdToman = readUsdTomanRate();
        const fetchedAt = new Date();
        return coins.map((coin) => {
            const usd = prices[COINGECKO_IDS[coin]]?.usd;
            if (!usd || usd <= 0)
                throw new Error(`Missing price for ${coin}`);
            return { coin, usd, usdToman, toman: toTomanRate(usd, usdToman), fetchedAt, source: "coingecko", stale: false };
        });
    }
    static async fetchBinanceRates(coins) {
        const usdToman = readUsdTomanRate();
        const fetchedAt = new Date();
        const results = await Promise.all(coins.map(async (coin) => {
            const symbol = BINANCE_SYMBOLS[coin];
            if (coin === "USDT")
                return { coin, usd: 1, usdToman, toman: usdToman, fetchedAt, source: "binance", stale: false };
            if (!symbol)
                throw new Error(`No secondary source for ${coin}`);
            const price = await fetchJsonWithTimeout(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`);
            const usd = Number(price.price);
            if (!Number.isFinite(usd) || usd <= 0)
                throw new Error(`Missing secondary price for ${coin}`);
            return { coin, usd, usdToman, toman: toTomanRate(usd, usdToman), fetchedAt, source: "binance", stale: false };
        }));
        return results;
    }
    static async fallbackRates(coins, sampleError) {
        const rates = [];
        for (const coin of coins) {
            const fallback = rateCache.get(coin) ?? await this.getDbFallback(coin) ?? this.getEnvFallback(coin);
            if (!fallback)
                continue;
            const stale = fallback.source === "env" || !isFresh(fallback);
            const rate = { ...fallback, stale, source: fallback.source };
            rates.push(rate);
            if (fallback.source === "env")
                logger_1.logger.warn("CRYPTO_RATE_FALLBACK_ENV_USED", { event: "CRYPTO_RATE_FALLBACK_ENV_USED", coin, sampleError });
            else
                logger_1.logger.warn("CRYPTO_RATE_FALLBACK_CACHE_USED", { event: "CRYPTO_RATE_FALLBACK_CACHE_USED", coin, source: fallback.source, cacheAgeMs: Date.now() - fallback.fetchedAt.getTime(), stale, sampleError });
            if (stale)
                await this.alertRateFailure(`stale:${coin}`, `All crypto rate sources failed for ${coin}; cache/source is stale; sample=${sampleError}`);
        }
        return rates;
    }
    static async onFetchSuccess(rates) {
        for (const rate of rates)
            rateCache.set(rate.coin, rate);
        logger_1.logger.info("CRYPTO_RATE_FETCH_SUCCESS", { event: "CRYPTO_RATE_FETCH_SUCCESS", coins: rates.map((rate) => rate.coin), source: rates[0]?.source });
    }
    static async persistRates(rates) {
        await Promise.all(rates.map((rate) => prisma_1.prisma.cryptoWallet.updateMany({ where: { coinName: rate.coin }, data: { rateToman: Math.round(rate.toman), lastRateAt: rate.fetchedAt } })));
    }
    static async getDbFallback(coin) {
        const wallet = await prisma_1.prisma.cryptoWallet.findFirst({ where: { coinName: coin, rateToman: { gt: 0 } }, orderBy: { updatedAt: "desc" } });
        if (!wallet)
            return undefined;
        return { coin, usd: 0, usdToman: 0, toman: wallet.rateToman, fetchedAt: wallet.lastRateAt ?? wallet.updatedAt, source: "database", stale: true };
    }
    static getEnvFallback(coin) {
        if (coin !== "USDT")
            return undefined;
        const usdToman = readUsdTomanRate(false);
        if (!usdToman)
            return undefined;
        const fetchedAt = new Date();
        return { coin, usd: 1, usdToman, toman: usdToman, fetchedAt, source: "env", stale: true };
    }
    static async alertRateFailure(key, description) {
        const now = Date.now();
        if (lastAdminRateAlert?.key === key && now - lastAdminRateAlert.at < alertCooldownMs()) {
            logger_1.logger.warn("CRYPTO_RATE_ALERT_SUPPRESSED", { event: "CRYPTO_RATE_ALERT_SUPPRESSED", key, description, lastFailedRateUpdateAt });
            return;
        }
        lastAdminRateAlert = { key, at: now };
        logger_1.logger.warn("CRYPTO_RATE_ALERT_SENT", { event: "CRYPTO_RATE_ALERT_SENT", key, description, lastFailedRateUpdateAt });
        monitoring_service_1.MonitoringService.record({
            type: "CRYPTO_RATE_FAILED",
            section: "Crypto Rate",
            description,
            severity: "warning",
            alert: true,
            suggestedAction: "اتصال منابع نرخ، مقدار USD_TOMAN_RATE، و تازگی نرخ‌های ذخیره‌شده را بررسی کنید.",
            metadata: { lastFailedRateUpdateAt, staleAfterMinutes: staleAfterMs() / 60000 },
        });
    }
}
exports.CryptoRateService = CryptoRateService;
