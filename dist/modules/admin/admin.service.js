"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminService = void 0;
const prisma_1 = require("../../services/prisma");
class AdminService {
    static async dashboard() {
        const [users, products, submittedDeposits, openTickets, orders] = await Promise.all([
            prisma_1.prisma.user.count(),
            prisma_1.prisma.product.count(),
            prisma_1.prisma.deposit.count({ where: { status: "submitted" } }),
            prisma_1.prisma.ticket.count({ where: { status: "open" } }),
            prisma_1.prisma.order.count(),
        ]);
        return { users, products, submittedDeposits, openTickets, orders };
    }
}
exports.AdminService = AdminService;
