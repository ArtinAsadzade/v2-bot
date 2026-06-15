import { prisma } from "../../services/prisma";
import { logger } from "../../services/logger";
import { MonitoringService } from "../../services/monitoring.service";

const STORE_STATUS_CACHE_TTL_MS = 30_000;
const USER_STATUS_CACHE_TTL_MS = 15_000;

export const BLOCKED_USER_MESSAGE = "⛔ حساب کاربری شما مسدود شده است.";
export const STORE_DISABLED_MESSAGE = "🚧 فروشگاه موقتاً غیرفعال است.";

type UserAccessState = { expiresAt: number; isBanned: boolean; role: "user" | "admin" | "superadmin" };
let storeStatusCache: { expiresAt: number; status: "active" | "inactive" } | undefined;
const userStatusCache = new Map<string, UserAccessState>();

export class SystemSettingsService {
  static async getFinancialSettingsCached() {
    if (storeStatusCache && storeStatusCache.expiresAt > Date.now()) return storeStatusCache.status;
    const setting = await prisma.financialSetting.upsert({ where: { id: "singleton" }, update: {}, create: { id: "singleton" } });
    storeStatusCache = { status: setting.storeStatus, expiresAt: Date.now() + STORE_STATUS_CACHE_TTL_MS };
    return setting.storeStatus;
  }

  static async setStoreStatus(status: "active" | "inactive", actorId: string) {
    const setting = await prisma.financialSetting.upsert({ where: { id: "singleton" }, update: { storeStatus: status }, create: { id: "singleton", storeStatus: status } });
    this.invalidateStoreStatusCache();
    await prisma.auditLog.create({ data: { actorId, action: "store.status.update", metadata: JSON.stringify({ status }) } });
    return setting;
  }

  static invalidateStoreStatusCache() {
    storeStatusCache = undefined;
  }

  static async userAccessByTelegramId(telegramId: string) {
    const cached = userStatusCache.get(telegramId);
    if (cached && cached.expiresAt > Date.now()) return cached;
    const user = await prisma.user.findUnique({ where: { telegramId }, select: { isBanned: true, role: true } });
    const state: UserAccessState = { isBanned: user?.isBanned ?? false, role: user?.role ?? "user", expiresAt: Date.now() + USER_STATUS_CACHE_TTL_MS };
    userStatusCache.set(telegramId, state);
    return state;
  }

  static invalidateUserStatus(telegramId?: string) {
    if (telegramId) userStatusCache.delete(telegramId);
    else userStatusCache.clear();
  }
}

export type MarketRate = {
  coin: string;
  usd: number;
  usdToman: number;
  toman: number;
  fetchedAt: Date;
  source: string;
  stale: boolean;
};

type RateSource = "coingecko" | "binance" | "memory-cache" | "database" | "env";

const SUPPORTED_COINS = ["USDT", "BTC", "ETH", "TON", "TRX"] as const;
type SupportedCoin = (typeof SUPPORTED_COINS)[number];
const COINGECKO_IDS: Record<SupportedCoin, string> = { USDT: "tether", BTC: "bitcoin", ETH: "ethereum", TON: "the-open-network", TRX: "tron" };
const BINANCE_SYMBOLS: Partial<Record<SupportedCoin, string>> = { USDT: "USDCUSDT", BTC: "BTCUSDT", ETH: "ETHUSDT", TRX: "TRXUSDT" };
const rateCache = new Map<string, MarketRate>();
let lastAdminRateAlert: { key: string; at: number } | undefined;
let lastFailedRateUpdateAt: Date | undefined;

function envNumber(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw.replace(/[,،\s]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function rateTimeoutMs() { return envNumber("CRYPTO_RATE_TIMEOUT_MS", 8_000); }
function alertCooldownMs() { return envNumber("CRYPTO_RATE_ALERT_COOLDOWN_MINUTES", 30) * 60_000; }
function staleAfterMs() { return envNumber("CRYPTO_RATE_STALE_AFTER_MINUTES", 360) * 60_000; }

function readUsdTomanRate(required = true) {
  const raw = process.env.USD_TOMAN_RATE ?? process.env.USDT_TOMAN_RATE;
  if (!raw) {
    if (required) throw new Error("USD_TOMAN_RATE is invalid");
    return undefined;
  }
  const normalized = raw.replace(/[,،\s]/g, "");
  const usdToman = Number(normalized);
  if (!Number.isFinite(usdToman) || usdToman <= 0) {
    if (required) throw new Error("USD_TOMAN_RATE is invalid");
    return undefined;
  }
  return usdToman;
}

function toTomanRate(usd: number, usdToman: number) {
  if (!Number.isFinite(usd) || usd <= 0) throw new Error("USD price is invalid");
  if (!Number.isFinite(usdToman) || usdToman <= 0) throw new Error("USD_TOMAN_RATE is invalid");
  const toman = usd * usdToman;
  if (!Number.isFinite(toman) || toman <= 0) throw new Error("Toman rate is invalid");
  return toman;
}

function normalizeCoin(coin: string): SupportedCoin {
  const normalized = coin.trim().toUpperCase();
  if (!SUPPORTED_COINS.includes(normalized as SupportedCoin)) throw new Error("رمز ارز پشتیبانی نمی‌شود");
  return normalized as SupportedCoin;
}

async function fetchJsonWithTimeout(url: string, timeoutMs = rateTimeoutMs()) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function isFresh(rate: MarketRate) {
  return Date.now() - rate.fetchedAt.getTime() <= staleAfterMs();
}

export class CryptoRateService {
  static supportedCoins() {
    return [...SUPPORTED_COINS];
  }

  static async getRateToman(coin: string): Promise<MarketRate> {
    const normalized = normalizeCoin(coin);
    const cached = rateCache.get(normalized);
    if (cached && Date.now() - cached.fetchedAt.getTime() < 5 * 60_000) return cached;

    const rates = await this.resolveRates([normalized]);
    const rate = rates[0];
    if (!rate) throw new Error("دریافت نرخ رمز ارز فعلاً ممکن نیست و نرخ جایگزینی وجود ندارد");
    if (!rate.stale) await this.persistRates([rate]);
    return rate;
  }

  static async refreshAll() {
    const wallets = await prisma.cryptoWallet.findMany({ where: { status: "active" }, select: { coinName: true } });
    const coins = [...new Set(wallets.map((wallet) => wallet.coinName.toUpperCase()).filter((coin): coin is SupportedCoin => SUPPORTED_COINS.includes(coin as SupportedCoin)))];
    if (!coins.length) return [];
    const rates = await this.resolveRates(coins);
    await this.persistRates(rates.filter((rate) => rate.source !== "env"));
    return rates;
  }

  private static async resolveRates(coins: SupportedCoin[]): Promise<MarketRate[]> {
    logger.info("CRYPTO_RATE_FETCH_STARTED", { event: "CRYPTO_RATE_FETCH_STARTED", coins });
    try {
      const rates = await this.tryFetchWithRetry(coins, "coingecko");
      await this.onFetchSuccess(rates);
      return rates;
    } catch (primaryError) {
      logger.warn("CRYPTO_RATE_FETCH_FAILED", { event: "CRYPTO_RATE_FETCH_FAILED", source: "coingecko", error: primaryError instanceof Error ? primaryError.message : String(primaryError), coins });
      try {
        const rates = await this.tryFetchWithRetry(coins, "binance");
        await this.onFetchSuccess(rates);
        return rates;
      } catch (secondaryError) {
        const sample = secondaryError instanceof Error ? secondaryError.message : String(secondaryError);
        lastFailedRateUpdateAt = new Date();
        logger.warn("CRYPTO_RATE_FETCH_FAILED", { event: "CRYPTO_RATE_FETCH_FAILED", source: "binance", error: sample, coins });
        const fallbackRates = await this.fallbackRates(coins, sample);
        if (fallbackRates.length) return fallbackRates;
        await this.alertRateFailure("no_fallback", `All crypto rate sources failed; sample=${sample}`);
        return [];
      }
    }
  }

  private static async tryFetchWithRetry(coins: SupportedCoin[], source: "coingecko" | "binance") {
    try {
      return await this.fetchRatesFromSource(coins, source);
    } catch (error) {
      await new Promise((resolve) => setTimeout(resolve, 350));
      return this.fetchRatesFromSource(coins, source);
    }
  }

  private static async fetchRatesFromSource(coins: SupportedCoin[], source: "coingecko" | "binance"): Promise<MarketRate[]> {
    if (source === "coingecko") return this.fetchCoingeckoRates(coins);
    return this.fetchBinanceRates(coins);
  }

  private static async fetchCoingeckoRates(coins: SupportedCoin[]): Promise<MarketRate[]> {
    const ids = coins.map((coin) => COINGECKO_IDS[coin]).join(",");
    const prices = await fetchJsonWithTimeout(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`) as Record<string, { usd?: number }>;
    const usdToman = readUsdTomanRate() as number;
    const fetchedAt = new Date();
    return coins.map((coin) => {
      const usd = prices[COINGECKO_IDS[coin]]?.usd;
      if (!usd || usd <= 0) throw new Error(`Missing price for ${coin}`);
      return { coin, usd, usdToman, toman: toTomanRate(usd, usdToman), fetchedAt, source: "coingecko", stale: false };
    });
  }

  private static async fetchBinanceRates(coins: SupportedCoin[]): Promise<MarketRate[]> {
    const usdToman = readUsdTomanRate() as number;
    const fetchedAt = new Date();
    const results = await Promise.all(coins.map(async (coin) => {
      const symbol = BINANCE_SYMBOLS[coin];
      if (coin === "USDT") return { coin, usd: 1, usdToman, toman: usdToman, fetchedAt, source: "binance", stale: false } as MarketRate;
      if (!symbol) throw new Error(`No secondary source for ${coin}`);
      const price = await fetchJsonWithTimeout(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`) as { price?: string };
      const usd = Number(price.price);
      if (!Number.isFinite(usd) || usd <= 0) throw new Error(`Missing secondary price for ${coin}`);
      return { coin, usd, usdToman, toman: toTomanRate(usd, usdToman), fetchedAt, source: "binance", stale: false } as MarketRate;
    }));
    return results;
  }

  private static async fallbackRates(coins: SupportedCoin[], sampleError: string) {
    const rates: MarketRate[] = [];
    for (const coin of coins) {
      const fallback = rateCache.get(coin) ?? await this.getDbFallback(coin) ?? this.getEnvFallback(coin);
      if (!fallback) continue;
      const stale = fallback.source === "env" || !isFresh(fallback);
      const rate = { ...fallback, stale, source: fallback.source as RateSource } as MarketRate;
      rates.push(rate);
      if (fallback.source === "env") logger.warn("CRYPTO_RATE_FALLBACK_ENV_USED", { event: "CRYPTO_RATE_FALLBACK_ENV_USED", coin, sampleError });
      else logger.warn("CRYPTO_RATE_FALLBACK_CACHE_USED", { event: "CRYPTO_RATE_FALLBACK_CACHE_USED", coin, source: fallback.source, cacheAgeMs: Date.now() - fallback.fetchedAt.getTime(), stale, sampleError });
      if (stale) await this.alertRateFailure(`stale:${coin}`, `All crypto rate sources failed for ${coin}; cache/source is stale; sample=${sampleError}`);
    }
    return rates;
  }

  private static async onFetchSuccess(rates: MarketRate[]) {
    for (const rate of rates) rateCache.set(rate.coin, rate);
    logger.info("CRYPTO_RATE_FETCH_SUCCESS", { event: "CRYPTO_RATE_FETCH_SUCCESS", coins: rates.map((rate) => rate.coin), source: rates[0]?.source });
  }

  private static async persistRates(rates: MarketRate[]) {
    await Promise.all(rates.map((rate) => prisma.cryptoWallet.updateMany({ where: { coinName: rate.coin }, data: { rateToman: Math.round(rate.toman), lastRateAt: rate.fetchedAt } })));
  }

  private static async getDbFallback(coin: SupportedCoin) {
    const wallet = await prisma.cryptoWallet.findFirst({ where: { coinName: coin, rateToman: { gt: 0 } }, orderBy: { updatedAt: "desc" } });
    if (!wallet) return undefined;
    return { coin, usd: 0, usdToman: 0, toman: wallet.rateToman, fetchedAt: wallet.lastRateAt ?? wallet.updatedAt, source: "database", stale: true } as MarketRate;
  }

  private static getEnvFallback(coin: SupportedCoin) {
    if (coin !== "USDT") return undefined;
    const usdToman = readUsdTomanRate(false);
    if (!usdToman) return undefined;
    const fetchedAt = new Date();
    return { coin, usd: 1, usdToman, toman: usdToman, fetchedAt, source: "env", stale: true } as MarketRate;
  }

  private static async alertRateFailure(key: string, description: string) {
    const now = Date.now();
    if (lastAdminRateAlert?.key === key && now - lastAdminRateAlert.at < alertCooldownMs()) {
      logger.warn("CRYPTO_RATE_ALERT_SUPPRESSED", { event: "CRYPTO_RATE_ALERT_SUPPRESSED", key, description, lastFailedRateUpdateAt });
      return;
    }
    lastAdminRateAlert = { key, at: now };
    logger.warn("CRYPTO_RATE_ALERT_SENT", { event: "CRYPTO_RATE_ALERT_SENT", key, description, lastFailedRateUpdateAt });
    MonitoringService.record({
      type: "CRYPTO_RATE_FAILED",
      section: "Crypto Rate",
      description,
      severity: "warning",
      alert: true,
      suggestedAction: "اتصال منابع نرخ، مقدار USD_TOMAN_RATE، و تازگی نرخ‌های ذخیره‌شده را بررسی کنید.",
      metadata: { lastFailedRateUpdateAt, staleAfterMinutes: staleAfterMs() / 60_000 },
    });
  }
}
