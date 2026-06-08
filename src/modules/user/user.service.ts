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
    const [user, activeAccounts, expiredAccounts, purchasedAccounts, activeFreeAccounts, recentOrders, walletTransactions, referralCount, pendingReferralRewards, freeRewards] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { balance: true, referralCode: true } }),
      prisma.orderItem.findMany({
        where: {
          order: { userId, status: "completed" },
          isActive: true,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          NOT: { productAccount: { is: { status: { in: ["disabled", "expired"] } } } },
        },
        include: { order: true, product: true, productAccount: true },
        orderBy: { purchaseDate: "desc" },
        take: 20,
      }),
      prisma.orderItem.findMany({
        where: { order: { userId, status: "completed" }, OR: [{ isActive: false }, { expiresAt: { lte: now } }, { productAccount: { is: { status: "expired" } } }] },
        include: { order: true, product: true, productAccount: true },
        orderBy: { purchaseDate: "desc" },
        take: 10,
      }),
      prisma.orderItem.findMany({
        where: { order: { userId, status: "completed" } },
        include: { order: true, product: true, productAccount: true },
        orderBy: { purchaseDate: "desc" },
      }),
      prisma.freeAccountAssignment.findMany({
        where: { userId, account: { is: { status: "assigned" } } },
        include: { account: true },
        orderBy: { createdAt: "desc" },
        take: 20,
      }).then((items) => items.filter((item) => {
        const assignedAt = item.assignedAt ?? item.createdAt;
        const expiresAt = item.expiresAt ?? new Date(assignedAt.getTime() + (item.account.durationDays * 86_400_000));
        return expiresAt > now;
      }).slice(0, 10)),
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
