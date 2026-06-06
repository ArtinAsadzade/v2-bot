import { prisma } from "../../services/prisma";
import { eventBus } from "../../services/event-bus.service";

const DEFAULT_THRESHOLD = Number(process.env.FREE_ACCOUNT_REFERRAL_THRESHOLD ?? 3);

export class FreeAccountService {
  static threshold() {
    return DEFAULT_THRESHOLD;
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
    const candidate = await prisma.freeAccountPool.findFirst({ where: { isAssigned: false, ...(productId ? { productId } : {}) }, orderBy: { createdAt: "asc" }, include: { product: true } });
    if (!candidate) throw new Error("اکانت رایگان موجود نیست");
    const updated = await prisma.freeAccountPool.update({ where: { id: candidate.id }, data: { isAssigned: true, assignedTo: userId, assignedAt: new Date(), reason }, include: { product: true } });
    eventBus.emit("free_account.assigned", { userId, productId: updated.productId, accountId: updated.id, reason });
    return updated;
  }

  static async autoAssignReferralReward(referrerId: string, referralCount: number) {
    if (referralCount < DEFAULT_THRESHOLD || referralCount % DEFAULT_THRESHOLD !== 0) return undefined;
    const alreadyAssignedForMilestone = await prisma.freeAccountPool.findFirst({ where: { assignedTo: referrerId, reason: `referral_${referralCount}` } });
    if (alreadyAssignedForMilestone) return alreadyAssignedForMilestone;
    return this.assign(referrerId, `referral_${referralCount}`).catch(() => undefined);
  }

  static async assignedForUser(userId: string) {
    return prisma.freeAccountPool.findMany({ where: { assignedTo: userId }, include: { product: true }, orderBy: { assignedAt: "desc" } });
  }
}

export function registerFreeAccountEvents() {
  eventBus.on("referral.earned", async (payload) => {
    await FreeAccountService.autoAssignReferralReward(payload.referrerId, payload.referralCount);
  });
}
