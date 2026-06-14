"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PublicPlansService = void 0;
const prisma_1 = require("../../services/prisma");
const visibility_1 = require("./visibility");
class PublicPlansService {
    static getSetting() {
        return prisma_1.prisma.publicPlansSetting.upsert({ where: { id: "singleton" }, update: {}, create: { id: "singleton", enabled: true } });
    }
    static async setEnabled(enabled, actorId) {
        const setting = await prisma_1.prisma.publicPlansSetting.upsert({ where: { id: "singleton" }, update: { enabled }, create: { id: "singleton", enabled } });
        await prisma_1.prisma.auditLog.create({ data: { actorId, action: "public_plans.status", metadata: JSON.stringify({ enabled }) } });
        return setting;
    }
    static listPublicPlans(takeCategories = 6, takeProducts = 4) {
        return prisma_1.prisma.category.findMany({
            where: { AND: [(0, visibility_1.activeCategoryWhere)(), { products: { some: { AND: [(0, visibility_1.activeProductWhere)(), { accounts: { some: (0, visibility_1.availableInventoryWhere)() } }] } } }] },
            orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
            take: takeCategories,
            include: { products: { where: { AND: [(0, visibility_1.activeProductWhere)(), { accounts: { some: (0, visibility_1.availableInventoryWhere)() } }] }, orderBy: [{ price: "asc" }, { title: "asc" }], take: takeProducts, include: { _count: { select: { accounts: { where: (0, visibility_1.availableInventoryWhere)() } } } } } },
        });
    }
}
exports.PublicPlansService = PublicPlansService;
