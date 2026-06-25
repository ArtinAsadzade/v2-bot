import { prisma } from "../../services/prisma";
import { WalletService } from "../wallet/wallet.service";
import { ReferralService } from "../referral/referral.service";

const db = prisma as any;

export type UserRewardDto = {
  id: string;
  source: "prediction" | "referral" | "manual" | "gift";
  title: string;
  description?: string;
  status: "available" | "claimed" | "failed" | "manual_review" | "revoked";
  rewardType: "wallet" | "product";
  walletAmount?: number;
  productId?: string;
  productTitle?: string;
  createdAt: Date;
  claimedAt?: Date | null;
  claimAction?: string;
};

export const REWARD_STATUS_LABELS: Record<UserRewardDto["status"], string> = {
  available: "🎁 آماده دریافت",
  claimed: "✅ دریافت‌شده",
  failed: "⚠️ نیازمند بررسی",
  manual_review: "🕓 در حال بررسی",
  revoked: "⛔ لغوشده",
};

function predictionStatus(status: string): UserRewardDto["status"] {
  if (status === "claimed") return "claimed";
  if (status === "failed") return "failed";
  return "available";
}

function referralStatus(status: string): UserRewardDto["status"] {
  if (status === "claimed") return "claimed";
  if (status === "pending" || status === "claimable") return "available";
  return "manual_review";
}

export class RewardService {
  static async listUserRewards(userId: string): Promise<UserRewardDto[]> {
    await ReferralService.materializeClaimableRewards(userId);
    const [predictionWinners, referralRewards] = await Promise.all([
      db.predictionWinner.findMany({ where: { userId }, include: { contest: true }, orderBy: { selectedAt: "desc" } }),
      db.referralReward.findMany({ where: { userId }, include: { tier: true }, orderBy: { createdAt: "desc" } }),
    ]);

    const rewards: UserRewardDto[] = [
      ...predictionWinners.map((winner: any) => ({
        id: winner.id,
        source: "prediction" as const,
        title: `جایزه پیش‌بینی: ${winner.contest?.title ?? "پیش‌بینی"}`,
        description: winner.contest?.question ?? undefined,
        status: predictionStatus(winner.status),
        rewardType: winner.rewardType,
        walletAmount: winner.rewardWalletAmount ?? undefined,
        productId: winner.rewardProductId ?? undefined,
        productTitle: winner.rewardType === "product" ? "محصول جایزه" : undefined,
        createdAt: winner.selectedAt,
        claimedAt: winner.claimedAt,
        claimAction: predictionStatus(winner.status) === "available" ? `reward:claim:prediction:${winner.id}` : undefined,
      })),
      ...referralRewards.map((reward: any) => ({
        id: reward.id,
        source: "referral" as const,
        title: `پاداش دعوت دوستان - سطح ${Number(reward.threshold).toLocaleString("fa-IR")}`,
        description: "پاداش معرفی دوستان به ربات",
        status: referralStatus(reward.status),
        rewardType: "wallet" as const,
        walletAmount: reward.amount,
        createdAt: reward.createdAt,
        claimedAt: reward.claimedAt,
        claimAction: referralStatus(reward.status) === "available" ? "reward:claim:referral" : undefined,
      })),
    ];

    return rewards.sort((a, b) => {
      const weight = (status: UserRewardDto["status"]) => (status === "available" ? 0 : status === "manual_review" || status === "failed" ? 1 : 2);
      return weight(a.status) - weight(b.status) || b.createdAt.getTime() - a.createdAt.getTime();
    });
  }

  static async claimPredictionReward(winnerId: string, telegramId: string) {
    return db.$transaction(async (tx: any) => {
      const winner = await tx.predictionWinner.findUnique({ where: { id: winnerId }, include: { contest: true } });
      if (!winner || winner.telegramId !== String(telegramId)) throw new Error("جایزه‌ای برای شما پیدا نشد.");
      if (winner.status === "claimed") return { alreadyClaimed: true };
      if (winner.status === "failed") throw new Error("⚠️ این جایزه نیازمند بررسی پشتیبانی است.");

      const claimedAt = new Date();
      const claimed = await tx.predictionWinner.updateMany({ where: { id: winner.id, status: { not: "claimed" } }, data: { status: "claimed", claimedAt } });
      if (claimed.count !== 1) return { alreadyClaimed: true };

      if (winner.rewardType === "wallet") {
        await WalletService.credit(winner.userId, winner.rewardWalletAmount ?? 0, `جایزه پیش‌بینی: ${winner.contest?.title ?? "پیش‌بینی"}`, tx, { actorId: "system", referenceId: `prediction:${winner.id}` });
      } else {
        await tx.predictionAuditLog.create({ data: { contestId: winner.contestId, userId: winner.userId, action: "reward.product.claimed", metadata: { winnerId: winner.id, productId: winner.rewardProductId } } });
      }

      await tx.predictionEntry.update({ where: { id: winner.entryId }, data: { status: "rewarded", rewardClaimedAt: claimedAt } });
      return { alreadyClaimed: false };
    });
  }

  static async claimReferralRewards(userId: string) {
    return ReferralService.claimPendingRewards(userId);
  }
}
