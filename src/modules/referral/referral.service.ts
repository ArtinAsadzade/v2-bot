import { prisma } from "../../services/prisma";
import { WalletService } from "../wallet/wallet.service";
import { eventBus } from "../../services/event-bus.service";

const REFERRAL_REWARD_AMOUNT = Number(process.env.REFERRAL_REWARD_AMOUNT ?? 10_000);

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
      await tx.referralReward.create({ data: { referralId: created.id, userId: referrer.id, amount: REFERRAL_REWARD_AMOUNT } });
      return created;
    });
    eventBus.emit("referral.created", { referralId: referral.id, referrerId: referrer.id, referredId: referredUserId });
    const referralCount = await prisma.referral.count({ where: { referrerId: referrer.id } });
    eventBus.emit("referral.earned", { referrerId: referrer.id, referredId: referredUserId, referralCount });
    return referral;
  }

  static async claimPendingRewards(userId: string) {
    return prisma.$transaction(async (tx) => {
      const rewards = await tx.referralReward.findMany({ where: { userId, status: "pending" } });
      const amount = rewards.reduce((sum, reward) => sum + reward.amount, 0);
      if (amount <= 0) throw new Error("پاداش قابل برداشتی وجود ندارد");

      await tx.referralReward.updateMany({ where: { userId, status: "pending" }, data: { status: "claimed", claimedAt: new Date() } });
      await WalletService.credit(userId, amount, "برداشت پاداش زیرمجموعه", tx);
      return { amount, rewards };
    }).then((result) => {
      for (const reward of result.rewards) {
        eventBus.emit("referral.reward.claimed", { rewardId: reward.id, userId, amount: reward.amount });
      }
      return result;
    });
  }

  static async getStats(userId: string) {
    const [totalReferrals, pending, claimed] = await Promise.all([
      prisma.referral.count({ where: { referrerId: userId } }),
      prisma.referralReward.aggregate({ where: { userId, status: "pending" }, _sum: { amount: true }, _count: true }),
      prisma.referralReward.aggregate({ where: { userId, status: "claimed" }, _sum: { amount: true }, _count: true }),
    ]);

    return {
      totalReferrals,
      pendingAmount: pending._sum.amount ?? 0,
      pendingCount: pending._count,
      claimedAmount: claimed._sum.amount ?? 0,
      claimedCount: claimed._count,
    };
  }
}
