import { prisma } from "../../services/prisma";

export type BroadcastTarget = "all_users" | "active_customers" | "inactive_customers" | "users_with_active_accounts" | "users_without_active_accounts";

export const BROADCAST_TARGET_LABELS: Record<BroadcastTarget, string> = {
  all_users: "همه کاربران",
  active_customers: "مشتریان فعال",
  inactive_customers: "مشتریان غیرفعال",
  users_with_active_accounts: "کاربران دارای اکانت فعال",
  users_without_active_accounts: "کاربران بدون اکانت فعال",
};

export type BroadcastStats = {
  target: BroadcastTarget;
  targetLabel: string;
  sent: number;
  delivered: number;
  failed: number;
};

export type BroadcastHistoryItem = BroadcastStats & {
  id: string;
  actorId: string;
  textPreview: string;
  createdAt: Date;
};

type BroadcastRecipient = { id: string; telegramId: string };
type SendBroadcastMessage = (telegramId: string, text: string) => Promise<unknown>;

function isBroadcastTarget(value: string): value is BroadcastTarget {
  return Object.prototype.hasOwnProperty.call(BROADCAST_TARGET_LABELS, value);
}

function activeAccountWhere(now: Date) {
  return {
    OR: [
      { orders: { some: { items: { some: { isActive: true, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } } } } },
      { freeAccountAssignments: { some: { isActive: true, expiresAt: { gt: now } } } },
    ],
  };
}

export class BroadcastService {
  static targetLabel(target: BroadcastTarget) {
    return BROADCAST_TARGET_LABELS[target];
  }

  static isTarget(value: string): value is BroadcastTarget {
    return isBroadcastTarget(value);
  }

  static async targetStats() {
    const targets = Object.keys(BROADCAST_TARGET_LABELS) as BroadcastTarget[];
    const rows = await Promise.all(targets.map(async (target) => ({ target, label: this.targetLabel(target), count: await this.countRecipients(target) })));
    return rows;
  }

  static async countRecipients(target: BroadcastTarget) {
    return prisma.user.count({ where: this.whereForTarget(target) });
  }

  static async send(target: BroadcastTarget, text: string, actorId: string, sendMessage: SendBroadcastMessage): Promise<BroadcastStats> {
    const normalizedText = text.trim();
    if (normalizedText.length < 3) throw new Error("متن اطلاع‌رسانی خیلی کوتاه است");

    const recipients = await this.recipients(target);
    let delivered = 0;
    let failed = 0;

    for (const recipient of recipients) {
      try {
        await sendMessage(recipient.telegramId, normalizedText);
        delivered += 1;
      } catch {
        failed += 1;
      }
    }

    const stats = { target, targetLabel: this.targetLabel(target), sent: recipients.length, delivered, failed };
    await prisma.auditLog.create({
      data: {
        actorId,
        action: "broadcast.sent",
        metadata: JSON.stringify({ ...stats, textPreview: normalizedText.slice(0, 180) }),
      },
    });
    return stats;
  }

  static async recent(take = 5): Promise<BroadcastHistoryItem[]> {
    const rows = await prisma.auditLog.findMany({ where: { action: "broadcast.sent" }, orderBy: { createdAt: "desc" }, take });
    return rows.map((row) => {
      const metadata = row.metadata ? JSON.parse(row.metadata) as Partial<BroadcastStats & { textPreview: string }> : {};
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

  private static async recipients(target: BroadcastTarget): Promise<BroadcastRecipient[]> {
    return prisma.user.findMany({ where: this.whereForTarget(target), select: { id: true, telegramId: true }, orderBy: { createdAt: "asc" } });
  }

  private static whereForTarget(target: BroadcastTarget) {
    const now = new Date();
    const activeAccount = activeAccountWhere(now);

    if (target === "active_customers") return { orders: { some: { status: "completed" as const } } };
    if (target === "inactive_customers") return { NOT: { orders: { some: { status: "completed" as const } } } };
    if (target === "users_with_active_accounts") return activeAccount;
    if (target === "users_without_active_accounts") return { NOT: activeAccount };
    return {};
  }
}
