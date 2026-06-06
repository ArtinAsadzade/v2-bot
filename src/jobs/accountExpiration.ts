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
    const [result, freeResult] = await Promise.all([
      prisma.orderItem.updateMany({
        where: { isActive: true, expiresAt: { lte: new Date() } },
        data: { isActive: false },
      }),
      FreeAccountService.expireDueAccounts(),
    ]);
    if (result.count > 0) logger.info("Expired purchased accounts deactivated", { count: result.count });
    if (freeResult.count > 0) logger.info("Expired free test accounts archived", { count: freeResult.count });
    return { count: result.count + freeResult.count };
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
