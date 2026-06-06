"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProductService = void 0;
const prisma_1 = require("../../services/prisma");
const event_bus_service_1 = require("../../services/event-bus.service");
class ProductService {
    static async getCategories() {
        return prisma_1.prisma.category.findMany({
            orderBy: { name: "asc" },
            include: { products: { where: { isActive: true }, orderBy: { title: "asc" } } },
        });
    }
    static async getProductsByCategory(categoryId) {
        return prisma_1.prisma.product.findMany({ where: { categoryId, isActive: true }, orderBy: { title: "asc" } });
    }
    static async getProduct(productId) {
        return prisma_1.prisma.product.findUnique({ where: { id: productId }, include: { category: true } });
    }
    static async create(data) {
        const category = data.categoryId
            ? await prisma_1.prisma.category.findUniqueOrThrow({ where: { id: data.categoryId } })
            : await prisma_1.prisma.category.upsert({ where: { name: (data.categoryName ?? "عمومی").trim() }, update: {}, create: { name: (data.categoryName ?? "عمومی").trim() } });
        return prisma_1.prisma.product.create({ data: { categoryId: category.id, title: data.title.trim(), price: data.price, duration: data.duration } });
    }
    static async addAccount(productId, data) {
        return prisma_1.prisma.productAccount.create({ data: { productId, username: data.username.trim(), password: data.password.trim(), config: data.config.trim(), status: "available" } });
    }
    static async bulkAddAccounts(productId, rows) {
        const validRows = rows.filter((row) => row.username && row.password && row.config);
        if (!validRows.length)
            throw new Error("اکانت معتبری برای ثبت وجود ندارد");
        await prisma_1.prisma.productAccount.createMany({ data: validRows.map((row) => ({ productId, username: row.username.trim(), password: row.password.trim(), config: row.config.trim(), status: "available" })) });
        return validRows.length;
    }
    static async listActiveProducts(take = 25) {
        return prisma_1.prisma.product.findMany({ where: { isActive: true }, include: { category: true }, orderBy: { title: "asc" }, take });
    }
    static async availableStock(productId) {
        return prisma_1.prisma.productAccount.count({ where: { productId, status: "available" } });
    }
    static async claimFreeAccount(userId, productId) {
        const product = await prisma_1.prisma.product.findUnique({ where: { id: productId } });
        if (!product)
            throw new Error("محصول پیدا نشد");
        const account = await prisma_1.prisma.$transaction(async (tx) => {
            const candidate = await tx.productAccount.findFirst({ where: { productId, status: "available" }, orderBy: { createdAt: "asc" } });
            if (!candidate)
                throw new Error("اکانت رایگان برای این محصول موجود نیست");
            const updated = await tx.productAccount.updateMany({ where: { id: candidate.id, status: "available" }, data: { status: "sold", soldTo: userId, soldAt: new Date() } });
            if (updated.count !== 1)
                throw new Error("تحویل اکانت ناموفق بود");
            return candidate;
        });
        event_bus_service_1.eventBus.emit("free_account.assigned", { userId, productId, accountId: account.id, reason: "manual_claim" });
        return { product, account };
    }
}
exports.ProductService = ProductService;
