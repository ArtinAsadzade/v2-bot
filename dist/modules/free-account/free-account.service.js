"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FreeAccountService = void 0;
exports.registerFreeAccountEvents = registerFreeAccountEvents;
const prisma_1 = require("../../services/prisma");
const event_bus_service_1 = require("../../services/event-bus.service");
const DEFAULT_THRESHOLD = Number(process.env.FREE_ACCOUNT_REFERRAL_THRESHOLD ?? 3);
class FreeAccountService {
    static threshold() {
        return DEFAULT_THRESHOLD;
    }
    static async addToPool(productId, data) {
        return prisma_1.prisma.freeAccountPool.create({ data: { productId, username: data.username.trim(), password: data.password.trim(), config: data.config.trim() } });
    }
    static async stats() {
        const [available, assigned, products] = await Promise.all([
            prisma_1.prisma.freeAccountPool.count({ where: { isAssigned: false } }),
            prisma_1.prisma.freeAccountPool.count({ where: { isAssigned: true } }),
            prisma_1.prisma.product.findMany({ where: { isActive: true }, include: { category: true, freeAccountPool: { where: { isAssigned: false }, take: 5 } }, orderBy: { title: "asc" }, take: 20 }),
        ]);
        return { available, assigned, products };
    }
    static async assign(userId, reason, productId) {
        const candidate = await prisma_1.prisma.freeAccountPool.findFirst({ where: { isAssigned: false, ...(productId ? { productId } : {}) }, orderBy: { createdAt: "asc" }, include: { product: true } });
        if (!candidate)
            throw new Error("اکانت رایگان موجود نیست");
        const updated = await prisma_1.prisma.freeAccountPool.update({ where: { id: candidate.id }, data: { isAssigned: true, assignedTo: userId, assignedAt: new Date(), reason }, include: { product: true } });
        event_bus_service_1.eventBus.emit("free_account.assigned", { userId, productId: updated.productId, accountId: updated.id, reason });
        return updated;
    }
    static async autoAssignReferralReward(referrerId, referralCount) {
        if (referralCount < DEFAULT_THRESHOLD || referralCount % DEFAULT_THRESHOLD !== 0)
            return undefined;
        const alreadyAssignedForMilestone = await prisma_1.prisma.freeAccountPool.findFirst({ where: { assignedTo: referrerId, reason: `referral_${referralCount}` } });
        if (alreadyAssignedForMilestone)
            return alreadyAssignedForMilestone;
        return this.assign(referrerId, `referral_${referralCount}`).catch(() => undefined);
    }
    static async assignedForUser(userId) {
        return prisma_1.prisma.freeAccountPool.findMany({ where: { assignedTo: userId }, include: { product: true }, orderBy: { assignedAt: "desc" } });
    }
}
exports.FreeAccountService = FreeAccountService;
function registerFreeAccountEvents() {
    event_bus_service_1.eventBus.on("referral.earned", async (payload) => {
        await FreeAccountService.autoAssignReferralReward(payload.referrerId, payload.referralCount);
    });
}
