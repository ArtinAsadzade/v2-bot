"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnalyticsService = void 0;
const prisma_1 = require("./prisma");
class AnalyticsService {
    static async dashboard() {
        const users = await prisma_1.prisma.user.count();
        const products = await prisma_1.prisma.product.count();
        const deposits = await prisma_1.prisma.deposit.count({
            where: {
                status: "approved",
            },
        });
        return {
            users,
            products,
            deposits,
        };
    }
}
exports.AnalyticsService = AnalyticsService;
