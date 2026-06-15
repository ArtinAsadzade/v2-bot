"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivateExpiredAccounts = deactivateExpiredAccounts;
const prisma_1 = require("../services/prisma");
const logger_1 = require("../services/logger");
const notification_service_1 = require("../services/notification.service");
const monitoring_service_1 = require("../services/monitoring.service");
const free_account_service_1 = require("../modules/free-account/free-account.service");
let isRunning = false;
const DAY_MS = 86400000;
const REMINDER_DAYS = [7, 3, 1, 0];
const DEFAULT_BATCH_SIZE = 25;
const ALERT_COOLDOWN_MS = 30 * 60000;
let lastExpirationAlert;
async function deactivateExpiredAccounts(batchSize = DEFAULT_BATCH_SIZE) {
    if (isRunning) {
        logger_1.logger.warn("Account expiration job skipped because previous run is still active");
        return { checked: 0, expired: 0, failed: 0, manualExpired: 0, xrayExpired: 0, freeExpired: 0, durationMs: 0 };
    }
    isRunning = true;
    const startedAt = Date.now();
    const summary = { checked: 0, expired: 0, failed: 0, manualExpired: 0, xrayExpired: 0, freeExpired: 0, durationMs: 0 };
    const errors = [];
    logger_1.logger.info("ACCOUNT_EXPIRATION_JOB_STARTED", { event: "ACCOUNT_EXPIRATION_JOB_STARTED", batchSize });
    try {
        await sendExpirationReminders().catch((error) => {
            logger_1.logger.warn("ACCOUNT_EXPIRATION_REMINDERS_FAILED", { event: "ACCOUNT_EXPIRATION_REMINDERS_FAILED", error: error instanceof Error ? error.message : String(error) });
        });
        const freeResult = await free_account_service_1.FreeAccountService.expireDueAccounts().catch((error) => {
            const message = error instanceof Error ? error.message : String(error);
            errors.push(`free accounts: ${message}`);
            summary.failed += 1;
            logger_1.logger.error("ACCOUNT_EXPIRATION_ITEM_FAILED", { event: "ACCOUNT_EXPIRATION_ITEM_FAILED", scope: "free_accounts", error: message });
            return { count: 0 };
        });
        summary.freeExpired = freeResult.count;
        summary.expired += freeResult.count;
        const now = new Date();
        while (true) {
            const dueItems = await findDueOrderItems(now, batchSize);
            if (!dueItems.length)
                break;
            summary.checked += dueItems.length;
            for (const item of dueItems) {
                try {
                    const result = await expireOneOrderItem(item, now);
                    if (!result.expired)
                        continue;
                    summary.expired += 1;
                    if (result.kind === "manual")
                        summary.manualExpired += 1;
                    if (result.kind === "xray")
                        summary.xrayExpired += 1;
                    logger_1.logger.info("ACCOUNT_EXPIRATION_ITEM_EXPIRED", { event: "ACCOUNT_EXPIRATION_ITEM_EXPIRED", orderItemId: item.id, orderId: item.orderId, kind: result.kind });
                }
                catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    summary.failed += 1;
                    errors.push(message);
                    logger_1.logger.error("ACCOUNT_EXPIRATION_ITEM_FAILED", { event: "ACCOUNT_EXPIRATION_ITEM_FAILED", orderItemId: item.id, orderId: item.orderId, error: message });
                }
            }
        }
        summary.durationMs = Date.now() - startedAt;
        logger_1.logger.info("ACCOUNT_EXPIRATION_JOB_FINISHED", { event: "ACCOUNT_EXPIRATION_JOB_FINISHED", ...summary });
        if (summary.failed > 0)
            await alertExpirationFailures(summary, errors[0]);
        return summary;
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        summary.failed += 1;
        summary.durationMs = Date.now() - startedAt;
        logger_1.logger.error("ACCOUNT_EXPIRATION_JOB_FAILED", { event: "ACCOUNT_EXPIRATION_JOB_FAILED", ...summary, error: message });
        await alertExpirationFailures(summary, message, true);
        return summary;
    }
    finally {
        isRunning = false;
    }
}
async function findDueOrderItems(now, take) {
    return prisma_1.prisma.orderItem.findMany({
        where: { isActive: true, expiresAt: { lte: now } },
        select: { id: true, orderId: true, productId: true, productAccountId: true, xrayClientId: true, expiresAt: true },
        orderBy: { expiresAt: "asc" },
        take,
    });
}
async function expireOneOrderItem(item, now) {
    return prisma_1.prisma.$transaction(async (tx) => {
        const deactivated = await tx.orderItem.updateMany({ where: { id: item.id, isActive: true, expiresAt: { lte: now } }, data: { isActive: false } });
        if (deactivated.count === 0)
            return { expired: false, kind: "order_item" };
        if (item.productAccountId) {
            const accountUpdate = await tx.productAccount.updateMany({ where: { id: item.productAccountId, status: "sold" }, data: { status: "expired" } });
            if (accountUpdate.count > 0) {
                const existingHistory = await tx.productAccountHistory.findFirst({ where: { accountId: item.productAccountId, action: "account.expire", metadata: { contains: item.id } }, select: { id: true } });
                if (!existingHistory) {
                    await tx.productAccountHistory.create({ data: { accountId: item.productAccountId, actorId: "system", action: "account.expire", fromValue: "sold", toValue: "expired", metadata: JSON.stringify({ orderId: item.orderId, orderItemId: item.id, productId: item.productId, expiresAt: item.expiresAt }) } });
                }
            }
            return { expired: true, kind: "manual" };
        }
        if (item.xrayClientId) {
            await tx.xrayClient.updateMany({ where: { id: item.xrayClientId, status: { in: ["creating", "provisioning", "active", "renewal_failed", "missing_on_panel"] } }, data: { status: "expired", lastError: null } });
            await tx.auditLog.create({ data: { actorId: "system", action: "xray_client.expire", metadata: JSON.stringify({ orderId: item.orderId, orderItemId: item.id, productId: item.productId, xrayClientId: item.xrayClientId, expiresAt: item.expiresAt }) } });
            return { expired: true, kind: "xray" };
        }
        await tx.auditLog.create({ data: { actorId: "system", action: "order_item.expire", metadata: JSON.stringify({ orderId: item.orderId, orderItemId: item.id, productId: item.productId, expiresAt: item.expiresAt }) } });
        return { expired: true, kind: "order_item" };
    }, { timeout: 15000, maxWait: 5000 });
}
async function alertExpirationFailures(summary, sampleError = "unknown", databaseFailure = false) {
    const key = sampleError.slice(0, 160);
    const now = Date.now();
    if (lastExpirationAlert?.key === key && now - lastExpirationAlert.at < ALERT_COOLDOWN_MS) {
        logger_1.logger.warn("ACCOUNT_EXPIRATION_ALERT_SUPPRESSED", { event: "ACCOUNT_EXPIRATION_ALERT_SUPPRESSED", failed: summary.failed, sampleError });
        return;
    }
    lastExpirationAlert = { key, at: now };
    logger_1.logger.warn("ACCOUNT_EXPIRATION_ALERT_SENT", { event: "ACCOUNT_EXPIRATION_ALERT_SENT", failed: summary.failed, sampleError });
    monitoring_service_1.MonitoringService.record({
        type: "JOB_FAILED",
        section: "Account Expiration",
        description: `failed=${summary.failed}; sample=${sampleError}`,
        severity: databaseFailure ? "critical" : "warning",
        alert: true,
        suggestedAction: `Failed count: ${summary.failed}. Duration: ${summary.durationMs}ms. لاگ ACCOUNT_EXPIRATION_ITEM_FAILED را بررسی کنید و آیتم مشکل‌دار را دستی بازبینی کنید.`,
        metadata: summary,
    });
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
