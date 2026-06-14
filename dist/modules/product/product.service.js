"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProductService = void 0;
const prisma_1 = require("../../services/prisma");
const visibility_1 = require("./visibility");
const xray_service_1 = require("../xray/xray.service");
class ProductService {
    static async getCategories() {
        return prisma_1.prisma.category.findMany({
            where: { AND: [(0, visibility_1.activeCategoryWhere)(), { products: { some: { AND: [(0, visibility_1.activeProductWhere)(), { OR: [{ mode: "xray_auto", stockLimit: { not: null }, soldCount: { lt: 999999999 } }, { accounts: { some: (0, visibility_1.availableInventoryWhere)() } }] }] } } }] },
            orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
            include: { products: { where: { AND: [(0, visibility_1.activeProductWhere)(), { OR: [{ mode: "xray_auto", stockLimit: { not: null }, soldCount: { lt: 999999999 } }, { accounts: { some: (0, visibility_1.availableInventoryWhere)() } }] }] }, orderBy: { title: "asc" } } },
        });
    }
    static async getProductsByCategory(categoryId) {
        return prisma_1.prisma.product.findMany({
            where: { categoryId, AND: [(0, visibility_1.activeProductWhere)(), { category: { is: (0, visibility_1.activeCategoryWhere)() } }, { OR: [{ mode: "xray_auto", stockLimit: { not: null }, soldCount: { lt: 999999999 } }, { accounts: { some: (0, visibility_1.availableInventoryWhere)() } }] }] },
            include: { _count: { select: { accounts: { where: (0, visibility_1.availableInventoryWhere)() } } } },
            orderBy: { title: "asc" },
        });
    }
    static async listFeaturedProducts(take = 6) {
        return prisma_1.prisma.product.findMany({
            where: { AND: [(0, visibility_1.activeProductWhere)(), { category: { is: (0, visibility_1.activeCategoryWhere)() } }, { OR: [{ mode: "xray_auto", stockLimit: { not: null }, soldCount: { lt: 999999999 } }, { accounts: { some: (0, visibility_1.availableInventoryWhere)() } }] }] },
            include: { category: true, _count: { select: { accounts: { where: (0, visibility_1.availableInventoryWhere)() } } } },
            orderBy: [{ orders: { _count: "desc" } }, { price: "asc" }],
            take,
        });
    }
    static async searchActiveProducts(query, take = 10) {
        const normalized = query.trim();
        if (normalized.length < 2)
            return [];
        return prisma_1.prisma.product.findMany({
            where: {
                AND: [(0, visibility_1.activeProductWhere)(), { category: { is: (0, visibility_1.activeCategoryWhere)() } }, { OR: [{ mode: "xray_auto", stockLimit: { not: null }, soldCount: { lt: 999999999 } }, { accounts: { some: (0, visibility_1.availableInventoryWhere)() } }] }],
                OR: [{ title: { contains: normalized } }, { category: { is: { name: { contains: normalized } } } }],
            },
            include: { category: true, _count: { select: { accounts: { where: (0, visibility_1.availableInventoryWhere)() } } } },
            orderBy: [{ price: "asc" }, { title: "asc" }],
            take,
        });
    }
    static async getProduct(productId) {
        return prisma_1.prisma.product.findUnique({ where: { id: productId }, include: { category: true } });
    }
    static async create(data) {
        const category = data.categoryId
            ? await prisma_1.prisma.category.findFirstOrThrow({ where: { id: data.categoryId, AND: [(0, visibility_1.activeCategoryWhere)()] } })
            : await prisma_1.prisma.category.upsert({ where: { name: (data.categoryName ?? "عمومی").trim() }, update: { isActive: true, deletedAt: null }, create: { name: (data.categoryName ?? "عمومی").trim(), isActive: true } });
        const inboundIds = data.inboundIds ?? [];
        return prisma_1.prisma.product.create({ data: { categoryId: category.id, title: data.title.trim(), price: data.price, duration: data.duration, durationDays: data.duration, mode: inboundIds.length ? "xray_auto" : "manual_inventory", trafficBytes: data.trafficGB ? (0, xray_service_1.gbToBytes)(data.trafficGB) : undefined, stockLimit: data.stockLimit, inboundIds, inboundSnapshot: data.inboundSnapshot } });
    }
    static async addAccount(productId, data) {
        if (!data.username.trim() || !data.subscriptionLink.trim() || !data.configLink.trim())
            throw new Error("اطلاعات اکانت کامل نیست");
        return prisma_1.prisma.productAccount.create({
            data: {
                productId,
                username: data.username.trim(),
                subscriptionLink: data.subscriptionLink.trim(),
                configLink: data.configLink.trim(),
                config: data.configLink.trim(),
                durationDays: data.durationDays,
                status: "available",
            },
        });
    }
    static async bulkAddAccounts(productId, rows) {
        const validRows = rows.filter((row) => row.username && row.subscriptionLink && row.configLink);
        if (!validRows.length)
            throw new Error("اکانت معتبری برای ثبت وجود ندارد");
        await prisma_1.prisma.productAccount.createMany({
            data: validRows.map((row) => ({
                productId,
                username: row.username.trim(),
                subscriptionLink: row.subscriptionLink.trim(),
                configLink: row.configLink.trim(),
                config: row.configLink.trim(),
                durationDays: row.durationDays,
                status: "available",
            })),
        });
        return validRows.length;
    }
    static async listActiveProducts(take = 25) {
        return prisma_1.prisma.product.findMany({ where: { AND: [(0, visibility_1.activeProductWhere)(), { category: { is: (0, visibility_1.activeCategoryWhere)() } }] }, include: { category: true }, orderBy: { title: "asc" }, take });
    }
    static async availableStock(productId) {
        const product = await prisma_1.prisma.product.findUnique({ where: { id: productId }, select: { mode: true, stockLimit: true, soldCount: true } });
        if (product?.mode === "xray_auto" && product.stockLimit)
            return Math.max(product.stockLimit - product.soldCount, 0);
        return prisma_1.prisma.productAccount.count({ where: (0, visibility_1.availableInventoryWhere)(productId) });
    }
    static async listCategoriesForAdmin(take = 100) {
        return prisma_1.prisma.category.findMany({ where: (0, visibility_1.categoryNotDeletedWhere)(), orderBy: [{ displayOrder: "asc" }, { name: "asc" }], take });
    }
    static async listSelectableCategoriesForAdmin(take = 50) {
        return prisma_1.prisma.category.findMany({ where: (0, visibility_1.activeCategoryWhere)(), orderBy: [{ displayOrder: "asc" }, { name: "asc" }], take });
    }
}
exports.ProductService = ProductService;
