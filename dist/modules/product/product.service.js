"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProductService = void 0;
const prisma_1 = require("../../services/prisma");
class ProductService {
    static async getAll() {
        return prisma_1.prisma.product.findMany({
            include: {
                items: true,
            },
        });
    }
    static async create(data) {
        return prisma_1.prisma.product.create({
            data,
        });
    }
}
exports.ProductService = ProductService;
