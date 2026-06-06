import { prisma } from "../../services/prisma";
import { notificationService } from "../../services/notification.service";
import { logger } from "../../services/logger";

const STORE_STATUS_CACHE_TTL_MS = 30_000;
const USER_STATUS_CACHE_TTL_MS = 15_000;

export const BLOCKED_USER_MESSAGE = "⛔ حساب کاربری شما توسط مدیریت مسدود شده است.\nدر صورت نیاز با پشتیبانی تماس بگیرید.";
export const STORE_DISABLED_MESSAGE = "🚧 فروشگاه در حال حاضر غیرفعال است.\nلطفاً بعداً مجدداً تلاش کنید.";

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
  toman: number;
  fetchedAt: Date;
  source: string;
  stale: boolean;
};

const SUPPORTED_COINS = ["USDT", "BTC", "ETH", "TON", "TRX"] as const;
type SupportedCoin = (typeof SUPPORTED_COINS)[number];
const COINGECKO_IDS: Record<SupportedCoin, string> = { USDT: "tether", BTC: "bitcoin", ETH: "ethereum", TON: "the-open-network", TRX: "tron" };
const rateCache = new Map<string, MarketRate>();
let lastAdminRateAlertAt = 0;

function normalizeCoin(coin: string): SupportedCoin {
  const normalized = coin.trim().toUpperCase();
  if (!SUPPORTED_COINS.includes(normalized as SupportedCoin)) throw new Error("رمز ارز پشتیبانی نمی‌شود");
  return normalized as SupportedCoin;
}

export class CryptoRateService {
  static supportedCoins() {
    return [...SUPPORTED_COINS];
  }

  static async getRateToman(coin: string): Promise<MarketRate> {
    const normalized = normalizeCoin(coin);
    const cached = rateCache.get(normalized);
    if (cached && Date.now() - cached.fetchedAt.getTime() < 5 * 60_000) return cached;
    try {
      const fresh = await this.fetchRates([normalized]).then((rates) => rates[0]);
      rateCache.set(normalized, fresh);
      await prisma.cryptoWallet.updateMany({ where: { coinName: normalized }, data: { rateToman: Math.round(fresh.toman), lastRateAt: fresh.fetchedAt } });
      return fresh;
    } catch (error) {
      logger.error("Crypto provider unavailable", { coin: normalized, error: error instanceof Error ? error.message : String(error) });
      const fallback = cached ?? (await this.getDbFallback(normalized));
      if (fallback) {
        await this.notifyAdminsProviderUnavailable(normalized);
        return { ...fallback, stale: true };
      }
      throw new Error("دریافت نرخ رمز ارز فعلاً ممکن نیست و نرخ ذخیره‌شده‌ای وجود ندارد");
    }
  }

  static async refreshAll() {
    const wallets = await prisma.cryptoWallet.findMany({ where: { status: "active" }, select: { coinName: true } });
    const coins = [...new Set(wallets.map((wallet) => wallet.coinName.toUpperCase()).filter((coin): coin is SupportedCoin => SUPPORTED_COINS.includes(coin as SupportedCoin)))];
    if (!coins.length) return [];
    try {
      const rates = await this.fetchRates(coins);
      await Promise.all(rates.map((rate) => {
        rateCache.set(rate.coin, rate);
        return prisma.cryptoWallet.updateMany({ where: { coinName: rate.coin }, data: { rateToman: Math.round(rate.toman), lastRateAt: rate.fetchedAt } });
      }));
      return rates;
    } catch (error) {
      logger.error("Crypto rate refresh failed", { error: error instanceof Error ? error.message : String(error) });
      await this.notifyAdminsProviderUnavailable(coins.join(", "));
      return coins.map((coin) => rateCache.get(coin)).filter((rate): rate is MarketRate => Boolean(rate));
    }
  }

  private static async fetchRates(coins: SupportedCoin[]): Promise<MarketRate[]> {
    const ids = coins.map((coin) => COINGECKO_IDS[coin]).join(",");
    const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`);
    if (!response.ok) throw new Error(`Coingecko returned ${response.status}`);
    const prices = await response.json() as Record<string, { usd?: number }>;
    const usdToman = Number(process.env.USD_TOMAN_RATE ?? process.env.USDT_TOMAN_RATE ?? 60_000);
    if (!Number.isFinite(usdToman) || usdToman <= 0) throw new Error("USD_TOMAN_RATE is invalid");
    const fetchedAt = new Date();
    return coins.map((coin) => {
      const usd = prices[COINGECKO_IDS[coin]]?.usd;
      if (!usd || usd <= 0) throw new Error(`Missing price for ${coin}`);
      return { coin, usd, toman: usd * usdToman, fetchedAt, source: "coingecko", stale: false };
    });
  }

  private static async getDbFallback(coin: SupportedCoin) {
    const wallet = await prisma.cryptoWallet.findFirst({ where: { coinName: coin, rateToman: { gt: 0 } }, orderBy: { updatedAt: "desc" } });
    if (!wallet) return undefined;
    return { coin, usd: 0, toman: wallet.rateToman, fetchedAt: wallet.lastRateAt ?? wallet.updatedAt, source: "database", stale: true };
  }

  private static async notifyAdminsProviderUnavailable(coin: string) {
    if (Date.now() - lastAdminRateAlertAt < 30 * 60_000) return;
    lastAdminRateAlertAt = Date.now();
    await notificationService.notifyAdmins(`⚠️ دریافت نرخ خودکار رمز ارز (${coin}) ناموفق بود. آخرین نرخ کش‌شده استفاده می‌شود.`);
  }
}
