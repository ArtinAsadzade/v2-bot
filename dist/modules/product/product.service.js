"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProductService = void 0;
const prisma_1 = require("../../services/prisma");
class ProductService {
    static async getCategories() {
        return prisma_1.prisma.category.findMany({
            orderBy: { name: "asc" },
            include: { products: { where: { isActive: true }, orderBy: { title: "asc" } } },
        });
    }
    static async getProductsByCategory(categoryId) {
        return prisma_1.prisma.product.findMany({
            where: { categoryId, isActive: true },
            orderBy: { title: "asc" },
        });
    }
    static async getProduct(productId) {
        return prisma_1.prisma.product.findUnique({ where: { id: productId }, include: { category: true } });
    }
    static async create(data) {
        const category = await prisma_1.prisma.category.upsert({
            where: { name: data.categoryName.trim() },
            update: {},
            create: { name: data.categoryName.trim() },
        });
        return prisma_1.prisma.product.create({
            data: { categoryId: category.id, title: data.title.trim(), price: data.price, duration: data.duration },
        });
    }
    static async addAccount(productId, data) {
        return prisma_1.prisma.productAccount.create({
            data: { productId, username: data.username, password: data.password, config: data.config, status: "available" },
        });
    }
    static async listActiveProducts(take = 25) {
        return prisma_1.prisma.product.findMany({ where: { isActive: true }, orderBy: { title: "asc" }, take });
    }
    static async availableStock(productId) {
        return prisma_1.prisma.productAccount.count({ where: { productId, status: "available" } });
    }
}
exports.ProductService = ProductService;
