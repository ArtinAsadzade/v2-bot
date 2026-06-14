"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PublicPlansService = void 0;
const prisma_1 = require("../../services/prisma");
const visibility_1 = require("./visibility");
class PublicPlansService {
    static availableStock(product) {
        return product.mode === "xray_auto" ? Math.max((product.stockLimit ?? 0) - product.soldCount, 0) : product._count.accounts;
    }
    static getSetting() {
        return prisma_1.prisma.publicPlansSetting.upsert({ where: { id: "singleton" }, update: {}, create: { id: "singleton", enabled: true } });
    }
    static async setEnabled(enabled, actorId) {
        const setting = await prisma_1.prisma.publicPlansSetting.upsert({ where: { id: "singleton" }, update: { enabled }, create: { id: "singleton", enabled } });
        await prisma_1.prisma.auditLog.create({ data: { actorId, action: "public_plans.status", metadata: JSON.stringify({ enabled }) } });
        return setting;
    }
    static async listPublicPlans(takeCategories = 6, takeProducts = 4) {
        const categories = await prisma_1.prisma.category.findMany({
            where: {
                AND: [(0, visibility_1.activeCategoryWhere)(), {
                        products: { some: { AND: [(0, visibility_1.activeProductWhere)(), { OR: [{ accounts: { some: (0, visibility_1.availableInventoryWhere)() } }, { mode: "xray_auto", stockLimit: { gt: 0 } }] }] } },
                    }],
            },
            orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
            take: takeCategories,
            include: { products: { where: (0, visibility_1.activeProductWhere)(), orderBy: [{ price: "asc" }, { title: "asc" }], include: { _count: { select: { accounts: { where: (0, visibility_1.availableInventoryWhere)() } } } } } },
        });
        return categories
            .map((category) => ({ ...category, products: category.products.filter((product) => this.availableStock(product) > 0).slice(0, takeProducts).map((product) => ({ ...product, availableStock: this.availableStock(product) })) }))
            .filter((category) => category.products.length > 0);
    }
}
exports.PublicPlansService = PublicPlansService;
