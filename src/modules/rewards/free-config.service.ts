import { prisma } from "../../services/prisma";
import { eventBus } from "../../services/event-bus.service";

const REQUIRED_REFERRALS = Number(process.env.FREE_CONFIG_REFERRAL_COUNT ?? 3);
const FREE_CONFIG_VALUE = process.env.FREE_CONFIG_VALUE ?? "کانفیگ رایگان هنوز توسط مدیر تنظیم نشده است.";

export class FreeConfigService {
  static async ensureReferralReward(userId: string) {
    const [referralCount, existingAvailable, existingClaimed] = await Promise.all([
      prisma.referral.count({ where: { referrerId: userId } }),
      prisma.freeConfigReward.findFirst({ where: { userId, status: "available" } }),
      prisma.freeConfigReward.findFirst({ where: { userId, reason: "referral_milestone", status: "claimed" } }),
    ]);

    if (existingAvailable) return existingAvailable;
    if (existingClaimed || referralCount < REQUIRED_REFERRALS) return undefined;

    return prisma.freeConfigReward.create({ data: { userId, config: FREE_CONFIG_VALUE, reason: "referral_milestone" } });
  }

  static async getStatus(userId: string) {
    const reward = await this.ensureReferralReward(userId);
    const referralCount = await prisma.referral.count({ where: { referrerId: userId } });
    return { reward, referralCount, requiredReferrals: REQUIRED_REFERRALS };
  }

  static async claim(userId: string) {
    const reward = await this.ensureReferralReward(userId);
    if (!reward) throw new Error("هنوز پاداش کانفیگ رایگان برای شما فعال نشده است");

    const claimed = await prisma.freeConfigReward.update({ where: { id: reward.id }, data: { status: "claimed", claimedAt: new Date() } });
    eventBus.emit("free_config.claimed", { rewardId: claimed.id, userId, config: claimed.config });
    return claimed;
  }
}
