"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BroadcastService = exports.BROADCAST_TARGET_LABELS = void 0;
const prisma_1 = require("../../services/prisma");
exports.BROADCAST_TARGET_LABELS = {
    all_users: "همه کاربران",
    active_customers: "مشتریان فعال",
    inactive_customers: "مشتریان غیرفعال",
    users_with_active_accounts: "کاربران دارای اکانت فعال",
    users_without_active_accounts: "کاربران بدون اکانت فعال",
};
function isBroadcastTarget(value) {
    return Object.prototype.hasOwnProperty.call(exports.BROADCAST_TARGET_LABELS, value);
}
function activeAccountWhere(now) {
    return {
        OR: [
            { orders: { some: { items: { some: { isActive: true, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } } } } },
            { freeAccountAssignments: { some: { isActive: true, expiresAt: { gt: now } } } },
        ],
    };
}
class BroadcastService {
    static targetLabel(target) {
        return exports.BROADCAST_TARGET_LABELS[target];
    }
    static isTarget(value) {
        return isBroadcastTarget(value);
    }
    static async targetStats() {
        const targets = Object.keys(exports.BROADCAST_TARGET_LABELS);
        const rows = await Promise.all(targets.map(async (target) => ({ target, label: this.targetLabel(target), count: await this.countRecipients(target) })));
        return rows;
    }
    static async countRecipients(target) {
        return prisma_1.prisma.user.count({ where: this.whereForTarget(target) });
    }
    static async send(target, text, actorId, sendMessage) {
        const normalizedText = text.trim();
        if (normalizedText.length < 3)
            throw new Error("متن اطلاع‌رسانی خیلی کوتاه است");
        const recipients = await this.recipients(target);
        let delivered = 0;
        let failed = 0;
        for (const recipient of recipients) {
            try {
                await sendMessage(recipient.telegramId, normalizedText);
                delivered += 1;
            }
            catch {
                failed += 1;
            }
        }
        const stats = { target, targetLabel: this.targetLabel(target), sent: recipients.length, delivered, failed };
        await prisma_1.prisma.auditLog.create({
            data: {
                actorId,
                action: "broadcast.sent",
                metadata: JSON.stringify({ ...stats, textPreview: normalizedText.slice(0, 180) }),
            },
        });
        return stats;
    }
    static async recent(take = 5) {
        const rows = await prisma_1.prisma.auditLog.findMany({ where: { action: "broadcast.sent" }, orderBy: { createdAt: "desc" }, take });
        return rows.map((row) => {
            const metadata = row.metadata ? JSON.parse(row.metadata) : {};
            const target = metadata.target && isBroadcastTarget(metadata.target) ? metadata.target : "all_users";
            return {
                id: row.id,
                actorId: row.actorId,
                createdAt: row.createdAt,
                target,
                targetLabel: metadata.targetLabel ?? this.targetLabel(target),
                sent: metadata.sent ?? 0,
                delivered: metadata.delivered ?? 0,
                failed: metadata.failed ?? 0,
                textPreview: metadata.textPreview ?? "—",
            };
        });
    }
    static async recipients(target) {
        return prisma_1.prisma.user.findMany({ where: this.whereForTarget(target), select: { id: true, telegramId: true }, orderBy: { createdAt: "asc" } });
    }
    static whereForTarget(target) {
        const now = new Date();
        const activeAccount = activeAccountWhere(now);
        if (target === "active_customers")
            return { orders: { some: { status: "completed" } } };
        if (target === "inactive_customers")
            return { NOT: { orders: { some: { status: "completed" } } } };
        if (target === "users_with_active_accounts")
            return activeAccount;
        if (target === "users_without_active_accounts")
            return { NOT: activeAccount };
        return {};
    }
}
exports.BroadcastService = BroadcastService;
