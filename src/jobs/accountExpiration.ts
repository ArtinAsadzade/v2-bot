import { prisma } from "../services/prisma";
import { logger } from "../services/logger";
import { notificationService } from "../services/notification.service";
import { FreeAccountService } from "../modules/free-account/free-account.service";

let isRunning = false;
const DAY_MS = 86_400_000;
const REMINDER_DAYS = [7, 3, 1, 0] as const;

export async function deactivateExpiredAccounts() {
  if (isRunning) {
    logger.warn("Account expiration job skipped because previous run is still active");
    return { count: 0 };
  }

  isRunning = true;
  try {
    await sendExpirationReminders();
    const now = new Date();
    const [result, expiredInventory, freeResult] = await Promise.all([
      prisma.orderItem.updateMany({
        where: { isActive: true, expiresAt: { lte: now } },
        data: { isActive: false },
      }),
      expirePurchasedInventory(now),
      FreeAccountService.expireDueAccounts(),
    ]);
    if (result.count > 0) logger.info("Expired purchased accounts deactivated", { count: result.count });
    if (expiredInventory.count > 0) logger.info("Expired purchased inventory marked", { count: expiredInventory.count });
    if (freeResult.count > 0) logger.info("Expired free test accounts archived", { count: freeResult.count });
    return { count: result.count + expiredInventory.count + freeResult.count };
  } finally {
    isRunning = false;
  }
}

async function sendExpirationReminders() {
  const now = Date.now();
  for (const daysBefore of REMINDER_DAYS) {
    const start = new Date(now + daysBefore * DAY_MS);
    const end = new Date(start.getTime() + DAY_MS);
    const items = await prisma.orderItem.findMany({
      where: { isActive: true, expiresAt: { gte: start, lt: end } },
      include: { product: true, order: { include: { user: true } } },
      take: 100,
    });
    for (const item of items) {
      const marker = await prisma.accountExpirationNotification.upsert({
        where: { orderItemId_daysBefore: { orderItemId: item.id, daysBefore } },
        update: {},
        create: { orderItemId: item.id, daysBefore },
      }).catch(() => undefined);
      if (!marker) continue;
      const label = daysBefore === 0 ? "امروز" : `${daysBefore.toLocaleString("fa-IR")} روز دیگر`;
      await notificationService.notifyUser(item.order.userId, {
        text: `⏰ یادآوری تمدید\n\nسرویس ${item.product.title} ${label} منقضی می‌شود.`,
        actions: [[{ text: "🔄 تمدید", callbackData: "nav:shop.categories" }]],
      });
    }
  }
}

async function expirePurchasedInventory(now: Date) {
  return prisma.$transaction(async (tx) => {
    const dueItems = await tx.orderItem.findMany({
      where: { expiresAt: { lte: now }, productAccount: { is: { status: "sold" } } },
      select: { id: true, productAccountId: true, productId: true, orderId: true, expiresAt: true },
      take: 500,
    });
    const accountIds = [...new Set(dueItems.map((item) => item.productAccountId))];
    if (!accountIds.length) return { count: 0 };

    const updated = await tx.productAccount.updateMany({
      where: { id: { in: accountIds }, status: "sold" },
      data: { status: "expired" },
    });

    if (updated.count > 0) {
      await tx.productAccountHistory.createMany({
        data: dueItems.map((item) => ({
          accountId: item.productAccountId,
          actorId: "system",
          action: "account.expire",
          fromValue: "sold",
          toValue: "expired",
          metadata: JSON.stringify({ orderId: item.orderId, orderItemId: item.id, productId: item.productId, expiresAt: item.expiresAt }),
        })),
      });
    }

    return { count: updated.count };
  });
}
