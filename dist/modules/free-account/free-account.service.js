"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FreeAccountService = void 0;
exports.registerFreeAccountEvents = registerFreeAccountEvents;
const prisma_1 = require("../../services/prisma");
const event_bus_service_1 = require("../../services/event-bus.service");
class FreeAccountService {
    static threshold() {
        return 1;
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
        const assigned = await prisma_1.prisma.$transaction(async (tx) => {
            const previous = await tx.freeAccountAssignment.findUnique({ where: { userId }, include: { account: { include: { product: true } } } });
            if (previous)
                throw new Error("شما قبلاً اکانت رایگان دریافت کرده‌اید");
            const candidate = await tx.freeAccountPool.findFirst({ where: { isAssigned: false, ...(productId ? { productId } : {}) }, orderBy: { createdAt: "asc" }, include: { product: true } });
            if (!candidate)
                throw new Error("اکانت رایگان موجود نیست");
            const updated = await tx.freeAccountPool.updateMany({ where: { id: candidate.id, isAssigned: false, assignedTo: null }, data: { isAssigned: true, assignedTo: userId, assignedAt: new Date(), reason } });
            if (updated.count !== 1)
                throw new Error("اکانت رایگان هم‌زمان تخصیص داده شد؛ دوباره تلاش کنید");
            await tx.freeAccountAssignment.create({ data: { userId, accountId: candidate.id, productId: candidate.productId, reason } });
            return { ...candidate, isAssigned: true, assignedTo: userId, assignedAt: new Date(), reason };
        });
        event_bus_service_1.eventBus.emit("free_account.assigned", { userId, productId: assigned.productId, accountId: assigned.id, reason });
        return assigned;
    }
    static async assignedForUser(userId) {
        return prisma_1.prisma.freeAccountPool.findMany({ where: { assignedTo: userId }, include: { product: true }, orderBy: { assignedAt: "desc" } });
    }
}
exports.FreeAccountService = FreeAccountService;
function registerFreeAccountEvents() {
    // Free accounts are intentionally separate from referral rewards.
}
