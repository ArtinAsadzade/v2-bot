"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProductService = void 0;
const prisma_1 = require("../../services/prisma");
const visibility_1 = require("./visibility");
const xray_service_1 = require("../xray/xray.service");
class ProductService {
    static isXrayInStock(product) {
        return product.mode === "xray_auto"
            && product.stockLimit !== null
            && product.stockLimit > product.soldCount
            && (product.trafficBytes === undefined || (product.trafficBytes !== null && product.trafficBytes > 0n))
            && (product.durationDays === undefined || (product.durationDays !== null && product.durationDays > 0));
    }
    static renewalProductWhere(categoryId) {
        return {
            ...(categoryId ? { categoryId } : {}),
            mode: "xray_auto",
            isActive: true,
            deletedAt: null,
            stockLimit: { gt: 0 },
            trafficBytes: { gt: 0n },
            durationDays: { gt: 0 },
            category: { is: (0, visibility_1.activeCategoryWhere)() },
        };
    }
    static async listRenewalCategories() {
        const categories = await prisma_1.prisma.category.findMany({
            where: {
                AND: [
                    (0, visibility_1.activeCategoryWhere)(),
                    { products: { some: this.renewalProductWhere() } },
                ],
            },
            include: { products: { where: this.renewalProductWhere(), orderBy: { title: "asc" } } },
            orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
        });
        return categories
            .map((category) => ({ ...category, products: category.products.filter((product) => this.isXrayInStock(product)) }))
            .filter((category) => category.products.length > 0);
    }
    static async listRenewalProductsByCategory(categoryId) {
        const products = await prisma_1.prisma.product.findMany({
            where: this.renewalProductWhere(categoryId),
            orderBy: [{ price: "asc" }, { title: "asc" }],
        });
        return products.filter((product) => this.isXrayInStock(product)).map((product) => ({ ...product, availableStock: Math.max((product.stockLimit ?? 0) - product.soldCount, 0) }));
    }
    static async getCategories() {
        const categories = await prisma_1.prisma.category.findMany({
            where: (0, visibility_1.activeCategoryWhere)(),
            orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
            include: { products: { where: (0, visibility_1.activeProductWhere)(), include: { _count: { select: { accounts: { where: (0, visibility_1.availableInventoryWhere)() } } } }, orderBy: { title: "asc" } } },
        });
        return categories.map((category) => ({ ...category, products: category.products.filter((product) => this.isXrayInStock(product) || product._count.accounts > 0) })).filter((category) => category.products.length > 0);
    }
    static async getProductsByCategory(categoryId) {
        const products = await prisma_1.prisma.product.findMany({
            where: { categoryId, AND: [(0, visibility_1.activeProductWhere)(), { category: { is: (0, visibility_1.activeCategoryWhere)() } }] },
            include: { _count: { select: { accounts: { where: (0, visibility_1.availableInventoryWhere)() } } } },
            orderBy: { title: "asc" },
        });
        return products.filter((product) => this.isXrayInStock(product) || product._count.accounts > 0).map((product) => ({ ...product, availableStock: this.isXrayInStock(product) ? Math.max((product.stockLimit ?? 0) - product.soldCount, 0) : product._count.accounts }));
    }
    static async listFeaturedProducts(take = 6) {
        const products = await prisma_1.prisma.product.findMany({
            where: { AND: [(0, visibility_1.activeProductWhere)(), { category: { is: (0, visibility_1.activeCategoryWhere)() } }] },
            include: { category: true, _count: { select: { accounts: { where: (0, visibility_1.availableInventoryWhere)() } } } },
            orderBy: [{ orders: { _count: "desc" } }, { price: "asc" }],
        });
        return products.filter((product) => this.isXrayInStock(product) || product._count.accounts > 0).slice(0, take);
    }
    static async searchActiveProducts(query, take = 10) {
        const normalized = query.trim();
        if (normalized.length < 2)
            return [];
        const products = await prisma_1.prisma.product.findMany({
            where: {
                AND: [(0, visibility_1.activeProductWhere)(), { category: { is: (0, visibility_1.activeCategoryWhere)() } }],
                OR: [{ title: { contains: normalized } }, { category: { is: { name: { contains: normalized } } } }],
            },
            include: { category: true, _count: { select: { accounts: { where: (0, visibility_1.availableInventoryWhere)() } } } },
            orderBy: [{ price: "asc" }, { title: "asc" }],
        });
        return products.filter((product) => this.isXrayInStock(product) || product._count.accounts > 0).slice(0, take);
    }
    static async getProduct(productId) {
        return prisma_1.prisma.product.findUnique({ where: { id: productId }, include: { category: true } });
    }
    static async create(data) {
        const category = data.categoryId
            ? await prisma_1.prisma.category.findFirstOrThrow({ where: { id: data.categoryId, AND: [(0, visibility_1.activeCategoryWhere)()] } })
            : await prisma_1.prisma.category.upsert({ where: { name: (data.categoryName ?? "عمومی").trim() }, update: { isActive: true, deletedAt: null }, create: { name: (data.categoryName ?? "عمومی").trim(), isActive: true } });
        const inboundIds = data.inboundIds ?? [];
        return prisma_1.prisma.product.create({ data: { categoryId: category.id, title: data.title.trim(), price: data.price, duration: data.duration, durationDays: inboundIds.length ? data.duration : undefined, mode: inboundIds.length ? "xray_auto" : "manual_inventory", trafficBytes: inboundIds.length && data.trafficGB ? (0, xray_service_1.gbToBytes)(data.trafficGB) : undefined, stockLimit: inboundIds.length ? data.stockLimit : undefined, soldCount: 0, inboundIds, inboundSnapshot: data.inboundSnapshot } });
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
