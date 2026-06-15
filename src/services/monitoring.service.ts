import { prisma } from "./prisma";
import { logger } from "./logger";
import { notificationService } from "./notification.service";

export type MonitoringEventType =
  | "PAYMENT_FAILED"
  | "PAYMENT_CALLBACK_FAILED"
  | "PAYMENT_DELIVERY_FAILED"
  | "PAYMENT_DUPLICATE_CALLBACK"
  | "TICKET_HANDLER_FAILED"
  | "PURCHASE_FAILED"
  | "INVENTORY_ASSIGN_FAILED"
  | "XRAY_PANEL_UNAVAILABLE"
  | "XRAY_CLIENT_CREATE_FAILED"
  | "XRAY_STOCK_RESERVATION_FAILED"
  | "XRAY_LIVE_LINKS_FAILED"
  | "CRYPTO_RATE_FAILED"
  | "JOB_FAILED"
  | "BUTTON_DATA_INVALID"
  | "UNHANDLED_BOT_ERROR"
  | "RATE_LIMIT_HIT";

type Severity = "info" | "warning" | "critical";

type MonitoringEvent = {
  type: MonitoringEventType;
  section: string;
  description: string;
  userId?: string;
  telegramId?: string;
  severity: Severity;
  suggestedAction: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
};

const events: MonitoringEvent[] = [];
const alertGroups = new Map<string, { count: number; lastAlertAt: number }>();
const MAX_EVENTS = 300;
const ALERT_GROUP_WINDOW_MS = 10 * 60_000;
const BUTTON_ALERT_THRESHOLD = 5;

function safeString(value: unknown) {
  if (value === undefined || value === null || value === "") return "-";
  return String(value);
}

function faDate(date: Date) {
  return new Intl.DateTimeFormat("fa-IR", { dateStyle: "short", timeStyle: "medium" }).format(date);
}

function alertText(event: MonitoringEvent, groupedCount = 1) {
  return `🚨 خطای سیستمی\n\nبخش:\n${event.section}\n\nشرح خطا:\n${event.description}${groupedCount > 1 ? `\nتکرار در بازه اخیر: ${groupedCount}` : ""}\n\nکاربر:\n${safeString(event.telegramId ?? event.userId)}\n\nزمان:\n${faDate(event.createdAt)}\n\nاقدام پیشنهادی:\n${event.suggestedAction}`;
}

export class MonitoringService {
  static record(input: Omit<MonitoringEvent, "createdAt" | "severity"> & { severity?: Severity; alert?: boolean }) {
    const event: MonitoringEvent = { severity: input.severity ?? "warning", createdAt: new Date(), ...input };
    events.unshift(event);
    if (events.length > MAX_EVENTS) events.length = MAX_EVENTS;
    logger[event.severity === "critical" ? "error" : event.severity === "warning" ? "warn" : "info"](event.type, event);
    if (input.alert || event.severity === "critical") void this.alertAdmins(event);
  }

  static rateLimitHit(data: { actionType: string; telegramId: string; userId?: string; count: number; limit: number }) {
    this.record({ type: "RATE_LIMIT_HIT", section: "Rate Limit", description: `${data.actionType}: ${data.count}/${data.limit}`, telegramId: data.telegramId, userId: data.userId, severity: "info", suggestedAction: "اگر از یک کاربر تکرار شد، الگوی اسپم یا مشکل UX را بررسی کنید.", metadata: data });
  }

  private static async alertAdmins(event: MonitoringEvent) {
    if (event.type === "BUTTON_DATA_INVALID" && this.recentCount("BUTTON_DATA_INVALID", 5 * 60_000) < BUTTON_ALERT_THRESHOLD) return;
    const key = `${event.type}:${event.section}:${event.description}`;
    const now = Date.now();
    const group = alertGroups.get(key);
    if (group && now - group.lastAlertAt < ALERT_GROUP_WINDOW_MS) {
      group.count += 1;
      return;
    }
    const count = (group?.count ?? 0) + 1;
    alertGroups.set(key, { count: 0, lastAlertAt: now });
    await notificationService.notifyAdmins(alertText(event, count)).catch((error) => logger.error("MONITORING_ALERT_FAILED", { error: error instanceof Error ? error.message : String(error), eventType: event.type }));
  }

  static recentCount(type: MonitoringEventType, windowMs: number) {
    const cutoff = Date.now() - windowMs;
    return events.filter((event) => event.type === type && event.createdAt.getTime() >= cutoff).length;
  }

  static async dashboard() {
    const [lastSuccessfulPayment, lastFailedPayment, lastCallbackReceived] = await Promise.all([
      prisma.paymentInvoice.findFirst({ where: { status: "COMPLETED" }, orderBy: { completedAt: "desc" }, select: { id: true, completedAt: true, user: { select: { telegramId: true } } } }).catch(() => null),
      prisma.paymentInvoice.findFirst({ where: { OR: [{ status: "FAILED" }, { deliveryStatus: "FAILED_DELIVERY" }] }, orderBy: { updatedAt: "desc" }, select: { id: true, updatedAt: true, user: { select: { telegramId: true } } } }).catch(() => null),
      prisma.paymentInvoice.findFirst({ where: { lastCallbackAt: { not: null } }, orderBy: { lastCallbackAt: "desc" }, select: { id: true, lastCallbackAt: true, user: { select: { telegramId: true } } } }).catch(() => null),
    ]);
    return { events: events.slice(0, 20), lastSuccessfulPayment, lastFailedPayment, lastCallbackReceived };
  }
}
