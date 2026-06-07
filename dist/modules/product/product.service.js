"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProductService = void 0;
const prisma_1 = require("../../services/prisma");
class ProductService {
    static async getCategories() {
        return prisma_1.prisma.category.findMany({
            where: { isActive: true, deletedAt: null, products: { some: { isActive: true, deletedAt: null, accounts: { some: { status: "available" } } } } },
            orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
            include: { products: { where: { isActive: true, deletedAt: null, accounts: { some: { status: "available" } } }, orderBy: { title: "asc" } } },
        });
    }
    static async getProductsByCategory(categoryId) {
        return prisma_1.prisma.product.findMany({
            where: { categoryId, isActive: true, deletedAt: null, category: { is: { isActive: true, deletedAt: null } }, accounts: { some: { status: "available" } } },
            include: { _count: { select: { accounts: { where: { status: "available" } } } } },
            orderBy: { title: "asc" },
        });
    }
    static async listFeaturedProducts(take = 6) {
        return prisma_1.prisma.product.findMany({
            where: { isActive: true, deletedAt: null, category: { is: { isActive: true, deletedAt: null } }, accounts: { some: { status: "available" } } },
            include: { category: true, _count: { select: { accounts: { where: { status: "available" } } } } },
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
                isActive: true,
                deletedAt: null,
                category: { is: { isActive: true, deletedAt: null } },
                accounts: { some: { status: "available" } },
                OR: [{ title: { contains: normalized } }, { category: { is: { name: { contains: normalized } } } }],
            },
            include: { category: true, _count: { select: { accounts: { where: { status: "available" } } } } },
            orderBy: [{ price: "asc" }, { title: "asc" }],
            take,
        });
    }
    static async getProduct(productId) {
        return prisma_1.prisma.product.findUnique({ where: { id: productId }, include: { category: true } });
    }
    static async create(data) {
        const category = data.categoryId
            ? await prisma_1.prisma.category.findUniqueOrThrow({ where: { id: data.categoryId } })
            : await prisma_1.prisma.category.upsert({ where: { name: (data.categoryName ?? "عمومی").trim() }, update: { deletedAt: null }, create: { name: (data.categoryName ?? "عمومی").trim() } });
        return prisma_1.prisma.product.create({ data: { categoryId: category.id, title: data.title.trim(), price: data.price, duration: data.duration } });
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
        return prisma_1.prisma.product.findMany({ where: { isActive: true, deletedAt: null }, include: { category: true }, orderBy: { title: "asc" }, take });
    }
    static async availableStock(productId) {
        return prisma_1.prisma.productAccount.count({ where: { productId, status: "available" } });
    }
    static async listCategoriesForAdmin(take = 100) {
        return prisma_1.prisma.category.findMany({ where: { deletedAt: null }, orderBy: [{ displayOrder: "asc" }, { name: "asc" }], take });
    }
}
exports.ProductService = ProductService;
