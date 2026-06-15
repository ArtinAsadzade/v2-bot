"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserService = void 0;
const prisma_1 = require("../../services/prisma");
const event_bus_service_1 = require("../../services/event-bus.service");
const referral_service_1 = require("../referral/referral.service");
const account_status_service_1 = require("../account/account-status.service");
class UserService {
    static async findOrCreateUser(ctxOrUser) {
        const tgUser = "id" in ctxOrUser ? ctxOrUser : ctxOrUser.from;
        if (!tgUser?.id)
            throw new Error("Telegram user is missing from context");
        const existing = await prisma_1.prisma.user.findUnique({ where: { telegramId: String(tgUser.id) } });
        const user = existing
            ? await prisma_1.prisma.user.update({ where: { id: existing.id }, data: { username: tgUser.username ?? null, firstName: tgUser.first_name ?? null, lastName: tgUser.last_name ?? null } })
            : await prisma_1.prisma.user.create({ data: { telegramId: String(tgUser.id), username: tgUser.username ?? null, firstName: tgUser.first_name ?? null, lastName: tgUser.last_name ?? null, referralCode: `ref${tgUser.id}` } });
        if (!existing)
            event_bus_service_1.eventBus.emit("user.created", { userId: user.id, telegramId: user.telegramId, referralCode: user.referralCode });
        if (!user.referralCode)
            await referral_service_1.ReferralService.ensureReferralCode(user.id, user.telegramId);
        return user;
    }
    static async getByTelegramId(telegramId) {
        return prisma_1.prisma.user.findUnique({ where: { telegramId: String(telegramId) } });
    }
    static async dashboard(userId) {
        const now = new Date();
        const [user, activeAccounts, expiredAccounts, purchasedAccounts, activeFreeAccounts, recentOrders, walletTransactions, referralCount, pendingReferralRewards, freeRewards] = await Promise.all([
            prisma_1.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { balance: true, referralCode: true } }),
            prisma_1.prisma.orderItem.findMany({
                where: { order: { userId, status: "completed" }, isActive: true, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
                include: { order: true, product: true, productAccount: true, xrayClient: true },
                orderBy: { purchaseDate: "desc" },
                take: 50,
            }).then((items) => items.filter((item) => (0, account_status_service_1.calculateAccountDisplayStatus)({
                status: item.productAccount?.status ?? item.xrayClient?.status,
                expiresAt: item.expiresAt ?? item.productAccount?.expiresAt ?? item.xrayClient?.expiresAt,
                disabledAt: item.productAccount?.disabledAt,
                deletedAt: item.productAccount?.deletedAt,
                productActive: item.product?.isActive,
                hasRequiredDeliveryData: Boolean(item.xrayClientId || (item.productAccountId && item.productAccount) || item.legacyStatus),
                legacy: item.legacyStatus === "broken_product_account",
            }, now) === "active").slice(0, 20)),
            prisma_1.prisma.orderItem.findMany({
                where: { order: { userId, status: "completed" }, OR: [{ isActive: false }, { expiresAt: { lte: now } }, { productAccount: { is: { status: "expired" } } }, { legacyStatus: { not: null } }] },
                include: { order: true, product: true, productAccount: true, xrayClient: true },
                orderBy: { purchaseDate: "desc" },
                take: 10,
            }),
            prisma_1.prisma.orderItem.findMany({
                where: { order: { userId, status: "completed" } },
                include: { order: true, product: true, productAccount: true, xrayClient: true },
                orderBy: { purchaseDate: "desc" },
            }),
            prisma_1.prisma.freeAccountAssignment.findMany({
                where: { userId, account: { is: { status: "assigned" } } },
                include: { account: true },
                orderBy: { createdAt: "desc" },
                take: 20,
            }).then((items) => items.filter((item) => {
                const assignedAt = item.assignedAt ?? item.createdAt;
                const expiresAt = item.expiresAt ?? new Date(assignedAt.getTime() + (item.account.durationDays * 86400000));
                return expiresAt > now;
            }).slice(0, 10)),
            prisma_1.prisma.order.findMany({ where: { userId }, include: { product: true }, orderBy: { createdAt: "desc" }, take: 10 }),
            prisma_1.prisma.walletTransaction.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 10 }),
            prisma_1.prisma.referral.count({ where: { referrerId: userId } }),
            prisma_1.prisma.referralReward.aggregate({ where: { userId, status: { in: ["pending", "claimable"] } }, _sum: { amount: true }, _count: true }),
            prisma_1.prisma.freeAccountAssignment.count({ where: { userId } }),
        ]);
        return {
            user,
            activeAccounts,
            expiredAccounts,
            activeFreeAccounts,
            purchasedAccounts,
            recentOrders,
            walletTransactions,
            referralCount,
            pendingReferralAmount: pendingReferralRewards._sum.amount ?? 0,
            pendingReferralCount: pendingReferralRewards._count,
            freeRewards,
        };
    }
}
exports.UserService = UserService;
