"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivateExpiredAccounts = deactivateExpiredAccounts;
const prisma_1 = require("../services/prisma");
const logger_1 = require("../services/logger");
const notification_service_1 = require("../services/notification.service");
let isRunning = false;
const DAY_MS = 86400000;
const REMINDER_DAYS = [7, 3, 1, 0];
async function deactivateExpiredAccounts() {
    if (isRunning) {
        logger_1.logger.warn("Account expiration job skipped because previous run is still active");
        return { count: 0 };
    }
    isRunning = true;
    try {
        await sendExpirationReminders();
        const result = await prisma_1.prisma.orderItem.updateMany({
            where: { isActive: true, expiresAt: { lte: new Date() } },
            data: { isActive: false },
        });
        if (result.count > 0)
            logger_1.logger.info("Expired purchased accounts deactivated", { count: result.count });
        return result;
    }
    finally {
        isRunning = false;
    }
}
async function sendExpirationReminders() {
    const now = Date.now();
    for (const daysBefore of REMINDER_DAYS) {
        const start = new Date(now + daysBefore * DAY_MS);
        const end = new Date(start.getTime() + DAY_MS);
        const items = await prisma_1.prisma.orderItem.findMany({
            where: { isActive: true, expiresAt: { gte: start, lt: end } },
            include: { product: true, order: { include: { user: true } } },
            take: 100,
        });
        for (const item of items) {
            const marker = await prisma_1.prisma.accountExpirationNotification.upsert({
                where: { orderItemId_daysBefore: { orderItemId: item.id, daysBefore } },
                update: {},
                create: { orderItemId: item.id, daysBefore },
            }).catch(() => undefined);
            if (!marker)
                continue;
            const label = daysBefore === 0 ? "امروز" : `${daysBefore.toLocaleString("fa-IR")} روز دیگر`;
            await notification_service_1.notificationService.notifyUser(item.order.userId, {
                text: `⏰ یادآوری تمدید\n\nسرویس ${item.product.title} ${label} منقضی می‌شود.`,
                actions: [[{ text: "🔄 تمدید", callbackData: "nav:shop.categories" }]],
            });
        }
    }
}
