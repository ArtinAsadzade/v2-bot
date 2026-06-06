"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReferralService = void 0;
const prisma_1 = require("../../services/prisma");
const wallet_service_1 = require("../wallet/wallet.service");
const event_bus_service_1 = require("../../services/event-bus.service");
const REFERRAL_REWARD_AMOUNT = Number(process.env.REFERRAL_REWARD_AMOUNT ?? 10000);
function makeReferralCode(telegramId) {
    return `ref${telegramId}`.replace(/[^a-zA-Z0-9_-]/g, "");
}
class ReferralService {
    static async ensureReferralCode(userId, telegramId) {
        const code = makeReferralCode(telegramId);
        const user = await prisma_1.prisma.user.update({ where: { id: userId }, data: { referralCode: code } });
        return user.referralCode ?? code;
    }
    static async linkReferral(referredUserId, referralCode) {
        if (!referralCode)
            return undefined;
        const referrer = await prisma_1.prisma.user.findFirst({ where: { referralCode } });
        if (!referrer || referrer.id === referredUserId)
            return undefined;
        const existing = await prisma_1.prisma.referral.findUnique({ where: { referredId: referredUserId } });
        if (existing)
            return existing;
        const referral = await prisma_1.prisma.referral.create({ data: { referrerId: referrer.id, referredId: referredUserId } });
        await prisma_1.prisma.user.update({ where: { id: referredUserId }, data: { referredById: referrer.id } });
        await prisma_1.prisma.referralReward.create({ data: { referralId: referral.id, userId: referrer.id, amount: REFERRAL_REWARD_AMOUNT } });
        event_bus_service_1.eventBus.emit("referral.created", { referralId: referral.id, referrerId: referrer.id, referredId: referredUserId });
        const referralCount = await prisma_1.prisma.referral.count({ where: { referrerId: referrer.id } });
        event_bus_service_1.eventBus.emit("referral.earned", { referrerId: referrer.id, referredId: referredUserId, referralCount });
        return referral;
    }
    static async claimPendingRewards(userId) {
        return prisma_1.prisma.$transaction(async (tx) => {
            const rewards = await tx.referralReward.findMany({ where: { userId, status: "pending" } });
            const amount = rewards.reduce((sum, reward) => sum + reward.amount, 0);
            if (amount <= 0)
                throw new Error("پاداش قابل برداشتی وجود ندارد");
            await tx.referralReward.updateMany({ where: { userId, status: "pending" }, data: { status: "claimed", claimedAt: new Date() } });
            await wallet_service_1.WalletService.credit(userId, amount, "برداشت پاداش زیرمجموعه", tx);
            return { amount, rewards };
        }).then((result) => {
            for (const reward of result.rewards) {
                event_bus_service_1.eventBus.emit("referral.reward.claimed", { rewardId: reward.id, userId, amount: reward.amount });
            }
            return result;
        });
    }
    static async getStats(userId) {
        const [totalReferrals, pending, claimed] = await Promise.all([
            prisma_1.prisma.referral.count({ where: { referrerId: userId } }),
            prisma_1.prisma.referralReward.aggregate({ where: { userId, status: "pending" }, _sum: { amount: true }, _count: true }),
            prisma_1.prisma.referralReward.aggregate({ where: { userId, status: "claimed" }, _sum: { amount: true }, _count: true }),
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
exports.ReferralService = ReferralService;
