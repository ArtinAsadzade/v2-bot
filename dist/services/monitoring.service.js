"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MonitoringService = void 0;
const prisma_1 = require("./prisma");
const logger_1 = require("./logger");
const notification_service_1 = require("./notification.service");
const events = [];
const alertGroups = new Map();
const MAX_EVENTS = 300;
const ALERT_GROUP_WINDOW_MS = 10 * 60000;
const BUTTON_ALERT_THRESHOLD = 5;
function safeString(value) {
    if (value === undefined || value === null || value === "")
        return "-";
    return String(value);
}
function faDate(date) {
    return new Intl.DateTimeFormat("fa-IR", { dateStyle: "short", timeStyle: "medium" }).format(date);
}
function alertText(event, groupedCount = 1) {
    return `🚨 خطای سیستمی\n\nبخش:\n${event.section}\n\nشرح خطا:\n${event.description}${groupedCount > 1 ? `\nتکرار در بازه اخیر: ${groupedCount}` : ""}\n\nکاربر:\n${safeString(event.telegramId ?? event.userId)}\n\nزمان:\n${faDate(event.createdAt)}\n\nاقدام پیشنهادی:\n${event.suggestedAction}`;
}
class MonitoringService {
    static record(input) {
        const event = { severity: input.severity ?? "warning", createdAt: new Date(), ...input };
        events.unshift(event);
        if (events.length > MAX_EVENTS)
            events.length = MAX_EVENTS;
        logger_1.logger[event.severity === "critical" ? "error" : event.severity === "warning" ? "warn" : "info"](event.type, event);
        if (input.alert || event.severity === "critical")
            void this.alertAdmins(event);
    }
    static rateLimitHit(data) {
        this.record({ type: "RATE_LIMIT_HIT", section: "Rate Limit", description: `${data.actionType}: ${data.count}/${data.limit}`, telegramId: data.telegramId, userId: data.userId, severity: "info", suggestedAction: "اگر از یک کاربر تکرار شد، الگوی اسپم یا مشکل UX را بررسی کنید.", metadata: data });
    }
    static async alertAdmins(event) {
        if (event.type === "BUTTON_DATA_INVALID" && this.recentCount("BUTTON_DATA_INVALID", 5 * 60000) < BUTTON_ALERT_THRESHOLD)
            return;
        const key = `${event.type}:${event.section}:${event.description}`;
        const now = Date.now();
        const group = alertGroups.get(key);
        if (group && now - group.lastAlertAt < ALERT_GROUP_WINDOW_MS) {
            group.count += 1;
            return;
        }
        const count = (group?.count ?? 0) + 1;
        alertGroups.set(key, { count: 0, lastAlertAt: now });
        await notification_service_1.notificationService.notifyAdmins(alertText(event, count)).catch((error) => logger_1.logger.error("MONITORING_ALERT_FAILED", { error: error instanceof Error ? error.message : String(error), eventType: event.type }));
    }
    static recentCount(type, windowMs) {
        const cutoff = Date.now() - windowMs;
        return events.filter((event) => event.type === type && event.createdAt.getTime() >= cutoff).length;
    }
    static async dashboard() {
        const [lastSuccessfulPayment, lastFailedPayment, lastCallbackReceived] = await Promise.all([
            prisma_1.prisma.paymentInvoice.findFirst({ where: { status: "COMPLETED" }, orderBy: { completedAt: "desc" }, select: { id: true, completedAt: true, user: { select: { telegramId: true } } } }).catch(() => null),
            prisma_1.prisma.paymentInvoice.findFirst({ where: { OR: [{ status: "FAILED" }, { deliveryStatus: "FAILED_DELIVERY" }] }, orderBy: { updatedAt: "desc" }, select: { id: true, updatedAt: true, user: { select: { telegramId: true } } } }).catch(() => null),
            prisma_1.prisma.paymentInvoice.findFirst({ where: { lastCallbackAt: { not: null } }, orderBy: { lastCallbackAt: "desc" }, select: { id: true, lastCallbackAt: true, user: { select: { telegramId: true } } } }).catch(() => null),
        ]);
        return { events: events.slice(0, 20), lastSuccessfulPayment, lastFailedPayment, lastCallbackReceived };
    }
}
exports.MonitoringService = MonitoringService;
