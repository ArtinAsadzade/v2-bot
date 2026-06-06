import { prisma } from "../../services/prisma";
import { eventBus } from "../../services/event-bus.service";
import { ReferralService } from "../referral/referral.service";

type TelegramUser = { id: number; username?: string; first_name?: string; last_name?: string };

export class UserService {
  static async findOrCreateUser(ctxOrUser: { from?: TelegramUser } | TelegramUser) {
    const tgUser: TelegramUser | undefined = "id" in ctxOrUser ? ctxOrUser : ctxOrUser.from;
    if (!tgUser?.id) throw new Error("Telegram user is missing from context");

    const existing = await prisma.user.findUnique({ where: { telegramId: String(tgUser.id) } });
    const user = existing
      ? await prisma.user.update({ where: { id: existing.id }, data: { username: tgUser.username ?? null, firstName: tgUser.first_name ?? null, lastName: tgUser.last_name ?? null } })
      : await prisma.user.create({ data: { telegramId: String(tgUser.id), username: tgUser.username ?? null, firstName: tgUser.first_name ?? null, lastName: tgUser.last_name ?? null, referralCode: `ref${tgUser.id}` } });

    if (!existing) eventBus.emit("user.created", { userId: user.id, telegramId: user.telegramId, referralCode: user.referralCode });
    if (!user.referralCode) await ReferralService.ensureReferralCode(user.id, user.telegramId);
    return user;
  }

  static async getByTelegramId(telegramId: number | string) {
    return prisma.user.findUnique({ where: { telegramId: String(telegramId) } });
  }

  static async dashboard(userId: string) {
    const now = new Date();
    const [user, activeAccounts, expiredAccounts, recentOrders, walletTransactions, referralCount, pendingReferralRewards, freeRewards] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { balance: true, referralCode: true } }),
      prisma.orderItem.findMany({
        where: { order: { userId }, isActive: true, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
        include: { order: true, product: true },
        orderBy: { purchaseDate: "desc" },
        take: 20,
      }),
      prisma.orderItem.findMany({
        where: { order: { userId }, OR: [{ isActive: false }, { expiresAt: { lte: now } }] },
        include: { order: true, product: true },
        orderBy: { purchaseDate: "desc" },
        take: 10,
      }),
      prisma.order.findMany({ where: { userId }, include: { product: true }, orderBy: { createdAt: "desc" }, take: 10 }),
      prisma.walletTransaction.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 10 }),
      prisma.referral.count({ where: { referrerId: userId } }),
      prisma.referralReward.aggregate({ where: { userId, status: { in: ["pending", "claimable"] } }, _sum: { amount: true }, _count: true }),
      prisma.freeAccountAssignment.count({ where: { userId } }),
    ]);
    return {
      user,
      activeAccounts,
      expiredAccounts,
      recentOrders,
      walletTransactions,
      referralCount,
      pendingReferralAmount: pendingReferralRewards._sum.amount ?? 0,
      pendingReferralCount: pendingReferralRewards._count,
      freeRewards,
    };
  }
}
