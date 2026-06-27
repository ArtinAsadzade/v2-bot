import { prisma } from "../../services/prisma";
import { WalletService } from "../wallet/wallet.service";
import { ReferralService } from "../referral/referral.service";
import { MISSING_REWARD_PRODUCT_LABEL, PredictionService } from "../prediction/prediction.service";
import { PaymentService } from "../payment/payment.service";
import { logger } from "../../services/logger";
import { assertProductDeliverySuccess, type ProductDeliverySuccess } from "../payment/payment.types";

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
  if (status === "manual_review") return "manual_review";
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
    const rewardProducts = await PredictionService.getRewardProductsById(
      predictionWinners.map((winner: any) => winner.rewardProductId),
    );

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
        productTitle: winner.rewardType === "product"
          ? (rewardProducts.get(String(winner.rewardProductId)) as any)?.title ?? MISSING_REWARD_PRODUCT_LABEL.replace(/^📦\s*/, "")
          : undefined,
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
    const initial = await db.$transaction(async (tx: any) => {
      const winner = await tx.predictionWinner.findUnique({ where: { id: winnerId }, include: { contest: true } });
      if (!winner || winner.telegramId !== String(telegramId)) throw new Error("جایزه‌ای برای شما پیدا نشد.");
      if (winner.status === "claimed") return { alreadyClaimed: true, rewardType: winner.rewardType };
      if (winner.status === "failed") throw new Error("⚠️ این جایزه نیازمند بررسی پشتیبانی است.");
      if (winner.status === "manual_review") throw new Error("⚠️ جایزه شما ثبت شد، اما فعال‌سازی سرویس نیاز به بررسی پشتیبانی دارد.");

      const claimedAt = new Date();
      if (winner.rewardType === "wallet") {
        const claimed = await tx.predictionWinner.updateMany({ where: { id: winner.id, status: { not: "claimed" } }, data: { status: "claimed", claimedAt } });
        if (claimed.count !== 1) return { alreadyClaimed: true, rewardType: "wallet" };
        await WalletService.credit(winner.userId, winner.rewardWalletAmount ?? 0, `جایزه پیش‌بینی: ${winner.contest?.title ?? "پیش‌بینی"}`, tx, { actorId: "system", referenceId: `prediction:${winner.id}` });
        await tx.predictionEntry.update({ where: { id: winner.entryId }, data: { status: "rewarded", rewardClaimedAt: claimedAt } });
        return { alreadyClaimed: false, rewardType: "wallet" };
      }

      if (!winner.rewardProductId) throw new Error("محصول جایزه پیدا نشد.");
      if (winner.deliveredOrderId || winner.deliveredOrderItemId || winner.deliveredXrayClientId || winner.deliveredProductAccountId)
        return { alreadyClaimed: true, rewardType: "product" };
      const reserved = await tx.predictionWinner.updateMany({
        where: { id: winner.id, status: { in: ["selected", "notified"] } },
        data: { status: "manual_review", failureReason: null, deliveryMetadata: { source: "prediction_reward", step: "delivery_started" } },
      });
      if (reserved.count !== 1) return { alreadyClaimed: true, rewardType: "product" };
      return {
        alreadyClaimed: false,
        rewardType: "product",
        winnerId: winner.id,
        userId: winner.userId,
        productId: winner.rewardProductId,
        entryId: winner.entryId,
        contestId: winner.contestId,
      };
    });
    if (initial.alreadyClaimed || initial.rewardType !== "product") return initial;

    try {
      const delivered = await prisma.$transaction((tx) =>
        PaymentService.purchaseProduct(tx, {
          userId: initial.userId,
          productId: initial.productId,
          method: "PREDICTION_REWARD",
          source: "prediction_reward",
          sourceId: initial.winnerId,
        }),
      );
      const createdDelivery = assertProductDeliverySuccess(delivered);
      const finalDelivery: ProductDeliverySuccess = createdDelivery.xrayClient
        ? (await PaymentService.provisionXrayClient(createdDelivery.order.id) as ProductDeliverySuccess)
        : createdDelivery;
      const claimedAt = new Date();
      await prisma.$transaction(async (tx) => {
        const claimed = await tx.predictionWinner.updateMany({
          where: { id: initial.winnerId, status: { not: "claimed" } },
          data: {
            status: "claimed",
            claimedAt,
            failureReason: null,
            deliveredOrderId: finalDelivery.order.id,
            deliveredOrderItemId: finalDelivery.orderItem?.id ?? null,
            deliveredXrayClientId: finalDelivery.xrayClient?.id ?? null,
            deliveredProductAccountId: finalDelivery.orderItem?.productAccountId ?? null,
            deliveryMetadata: {
              source: "prediction_reward",
              note: "prediction reward",
              productId: initial.productId,
              orderId: finalDelivery.order.id,
            },
          },
        });
        if (claimed.count !== 1) return;
        await tx.predictionEntry.update({ where: { id: initial.entryId }, data: { status: "rewarded", rewardClaimedAt: claimedAt } });
        await tx.predictionAuditLog.create({
          data: {
            contestId: initial.contestId,
            userId: initial.userId,
            action: "reward.product.delivered",
            metadata: { winnerId: initial.winnerId, productId: initial.productId, orderId: finalDelivery.order.id, orderItemId: finalDelivery.orderItem?.id, xrayClientId: finalDelivery.xrayClient?.id },
          },
        });
      });
      return { alreadyClaimed: false, rewardType: "product", delivered: finalDelivery };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("PREDICTION_PRODUCT_REWARD_DELIVERY_FAILED", { winnerId: initial.winnerId, userId: initial.userId, productId: initial.productId, error: message });
      await prisma.predictionWinner.update({
        where: { id: initial.winnerId },
        data: { status: "manual_review", failureReason: message, deliveryMetadata: { source: "prediction_reward", note: "prediction reward delivery failed", error: message } },
      });
      await prisma.predictionAuditLog.create({ data: { contestId: initial.contestId, userId: initial.userId, action: "reward.product.delivery_failed", metadata: { winnerId: initial.winnerId, productId: initial.productId, error: message } } });
      throw new Error("⚠️ جایزه شما ثبت شد، اما فعال‌سازی سرویس نیاز به بررسی پشتیبانی دارد.");
    }
  }

  static async claimReferralRewards(userId: string) {
    return ReferralService.claimPendingRewards(userId);
  }
}
