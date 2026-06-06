import { prisma } from "../../services/prisma";
import { eventBus } from "../../services/event-bus.service";

export class FreeAccountService {
  static threshold() {
    return 1;
  }

  static async addToPool(productId: string, data: { username: string; password: string; config: string }) {
    return prisma.freeAccountPool.create({ data: { productId, username: data.username.trim(), password: data.password.trim(), config: data.config.trim() } });
  }

  static async stats() {
    const [available, assigned, products] = await Promise.all([
      prisma.freeAccountPool.count({ where: { isAssigned: false } }),
      prisma.freeAccountPool.count({ where: { isAssigned: true } }),
      prisma.product.findMany({ where: { isActive: true }, include: { category: true, freeAccountPool: { where: { isAssigned: false }, take: 5 } }, orderBy: { title: "asc" }, take: 20 }),
    ]);
    return { available, assigned, products };
  }

  static async assign(userId: string, reason: string, productId?: string) {
    const assigned = await prisma.$transaction(async (tx) => {
      const previous = await tx.freeAccountAssignment.findUnique({ where: { userId }, include: { account: { include: { product: true } } } });
      if (previous) throw new Error("شما قبلاً اکانت رایگان دریافت کرده‌اید");
      const candidate = await tx.freeAccountPool.findFirst({ where: { isAssigned: false, ...(productId ? { productId } : {}) }, orderBy: { createdAt: "asc" }, include: { product: true } });
      if (!candidate) throw new Error("اکانت رایگان موجود نیست");
      const updated = await tx.freeAccountPool.updateMany({ where: { id: candidate.id, isAssigned: false, assignedTo: null }, data: { isAssigned: true, assignedTo: userId, assignedAt: new Date(), reason } });
      if (updated.count !== 1) throw new Error("اکانت رایگان هم‌زمان تخصیص داده شد؛ دوباره تلاش کنید");
      await tx.freeAccountAssignment.create({ data: { userId, accountId: candidate.id, productId: candidate.productId, reason } });
      return { ...candidate, isAssigned: true, assignedTo: userId, assignedAt: new Date(), reason };
    });
    eventBus.emit("free_account.assigned", { userId, productId: assigned.productId, accountId: assigned.id, reason });
    return assigned;
  }

  static async assignedForUser(userId: string) {
    return prisma.freeAccountPool.findMany({ where: { assignedTo: userId }, include: { product: true }, orderBy: { assignedAt: "desc" } });
  }
}

export function registerFreeAccountEvents() {
  // Free accounts are intentionally separate from referral rewards.
}
