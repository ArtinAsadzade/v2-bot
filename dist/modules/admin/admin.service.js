"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminService = void 0;
const prisma_1 = require("../../services/prisma");
const DASHBOARD_CACHE_TTL_MS = 30000;
let dashboardCache;
class AdminService {
    static async dashboard(forceRefresh = false) {
        if (!forceRefresh && dashboardCache && dashboardCache.expiresAt > Date.now()) {
            return dashboardCache.stats;
        }
        const [users, products, submittedDeposits, openTickets, orders, revenue] = await Promise.all([
            prisma_1.prisma.user.count(),
            prisma_1.prisma.product.count(),
            prisma_1.prisma.deposit.count({ where: { status: "submitted" } }),
            prisma_1.prisma.ticket.count({ where: { status: "open" } }),
            prisma_1.prisma.order.count(),
            prisma_1.prisma.order.aggregate({ where: { status: "completed" }, _sum: { totalAmount: true } }),
        ]);
        const stats = { users, products, submittedDeposits, openTickets, orders, revenue: revenue._sum.totalAmount ?? 0 };
        dashboardCache = { expiresAt: Date.now() + DASHBOARD_CACHE_TTL_MS, stats };
        return stats;
    }
    static invalidateDashboardCache() {
        dashboardCache = undefined;
    }
    static async audit(actorId, action, metadata) {
        await prisma_1.prisma.auditLog.create({
            data: {
                actorId,
                action,
                metadata: metadata === undefined ? undefined : JSON.stringify(metadata),
            },
        });
        this.invalidateDashboardCache();
    }
}
exports.AdminService = AdminService;
