import { prisma } from "../../services/prisma";
import { WalletService } from "../wallet/wallet.service";
import { eventBus } from "../../services/event-bus.service";

function makeReferralCode(telegramId: string) {
  return `ref${telegramId}`.replace(/[^a-zA-Z0-9_-]/g, "");
}

export class ReferralService {
  static async ensureReferralCode(userId: string, telegramId: string) {
    const code = makeReferralCode(telegramId);
    const user = await prisma.user.update({ where: { id: userId }, data: { referralCode: code } });
    return user.referralCode ?? code;
  }

  static async linkReferral(referredUserId: string, referralCode?: string) {
    if (!referralCode) return undefined;
    const referrer = await prisma.user.findFirst({ where: { referralCode } });
    if (!referrer || referrer.id === referredUserId) return undefined;
    const existing = await prisma.referral.findUnique({ where: { referredId: referredUserId } });
    if (existing) return existing;

    const referral = await prisma.$transaction(async (tx) => {
      const referred = await tx.user.findUnique({ where: { id: referredUserId }, select: { referredById: true } });
      if (referred?.referredById) {
        const current = await tx.referral.findUnique({ where: { referredId: referredUserId } });
        if (current) return current;
        throw new Error("این کاربر قبلا دعوت شده است");
      }
      const created = await tx.referral.create({ data: { referrerId: referrer.id, referredId: referredUserId } });
      await tx.user.update({ where: { id: referredUserId }, data: { referredById: referrer.id } });
      return created;
    });

    eventBus.emit("referral.created", { referralId: referral.id, referrerId: referrer.id, referredId: referredUserId });
    await this.materializeClaimableRewards(referrer.id, referral.id);
    const referralCount = await prisma.referral.count({ where: { referrerId: referrer.id } });
    eventBus.emit("referral.earned", { referrerId: referrer.id, referredId: referredUserId, referralCount });
    return referral;
  }

  static async materializeClaimableRewards(userId: string, referralId?: string) {
    return prisma.$transaction(async (tx) => {
      const count = await tx.referral.count({ where: { referrerId: userId } });
      const tiers = await tx.referralRewardTier.findMany({ where: { isActive: true, threshold: { lte: count } }, orderBy: { threshold: "asc" } });
      const created = [];
      for (const tier of tiers) {
        const reward = await tx.referralReward.upsert({
          where: { userId_threshold: { userId, threshold: tier.threshold } },
          update: {},
          create: { userId, referralId, tierId: tier.id, threshold: tier.threshold, amount: tier.amount, status: "claimable" },
        });
        created.push(reward);
      }
      return created;
    });
  }

  static async claimPendingRewards(userId: string) {
    await this.materializeClaimableRewards(userId);
    return prisma.$transaction(async (tx) => {
      const rewards = await tx.referralReward.findMany({ where: { userId, status: { in: ["pending", "claimable"] } } });
      const amount = rewards.reduce((sum, reward) => sum + reward.amount, 0);
      if (amount <= 0) throw new Error("پاداش قابل برداشتی وجود ندارد");
      const updated = await tx.referralReward.updateMany({ where: { userId, status: { in: ["pending", "claimable"] } }, data: { status: "claimed", claimedAt: new Date() } });
      if (updated.count !== rewards.length) throw new Error("برداشت پاداش هم‌زمان در حال انجام است");
      await WalletService.credit(userId, amount, "برداشت پاداش زیرمجموعه", tx);
      return { amount, rewards };
    }).then((result) => {
      for (const reward of result.rewards) eventBus.emit("referral.reward.claimed", { rewardId: reward.id, userId, amount: reward.amount });
      return result;
    });
  }

  static async getStats(userId: string) {
    await this.materializeClaimableRewards(userId);
    const [totalReferrals, pending, claimed] = await Promise.all([
      prisma.referral.count({ where: { referrerId: userId } }),
      prisma.referralReward.aggregate({ where: { userId, status: { in: ["pending", "claimable"] } }, _sum: { amount: true }, _count: true }),
      prisma.referralReward.aggregate({ where: { userId, status: "claimed" }, _sum: { amount: true }, _count: true }),
    ]);
    return { totalReferrals, pendingAmount: pending._sum.amount ?? 0, pendingCount: pending._count, claimedAmount: claimed._sum.amount ?? 0, claimedCount: claimed._count };
  }

  static async listTiers() {
    return prisma.referralRewardTier.findMany({ orderBy: { threshold: "asc" } });
  }

  static async upsertTier(threshold: number, amount: number, actorId: string, isActive = true) {
    if (!Number.isInteger(threshold) || threshold <= 0 || !Number.isInteger(amount) || amount <= 0) throw new Error("اطلاعات سطح پاداش معتبر نیست");
    const tier = await prisma.referralRewardTier.upsert({ where: { threshold }, update: { amount, isActive }, create: { threshold, amount, isActive } });
    await prisma.auditLog.create({ data: { actorId, action: "referral.tier.upsert", metadata: JSON.stringify({ tierId: tier.id, threshold, amount, isActive }) } });
    return tier;
  }

  static async setTierStatus(tierId: string, isActive: boolean, actorId: string) {
    const tier = await prisma.referralRewardTier.update({ where: { id: tierId }, data: { isActive } });
    await prisma.auditLog.create({ data: { actorId, action: "referral.tier.status", metadata: JSON.stringify({ tierId, isActive }) } });
    return tier;
  }

  static async deleteTier(tierId: string, actorId: string) {
    const tier = await prisma.referralRewardTier.delete({ where: { id: tierId } });
    await prisma.auditLog.create({ data: { actorId, action: "referral.tier.delete", metadata: JSON.stringify({ tierId }) } });
    return tier;
  }
}
