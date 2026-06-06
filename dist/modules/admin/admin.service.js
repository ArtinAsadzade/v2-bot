"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminService = void 0;
const prisma_1 = require("../../services/prisma");
const DASHBOARD_CACHE_TTL_MS = 30000;
let dashboardCache;
class AdminService {
    static async dashboard(forceRefresh = false) {
        if (!forceRefresh && dashboardCache && dashboardCache.expiresAt > Date.now())
            return dashboardCache.stats;
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
    static async listUsers(skip, take) {
        return Promise.all([prisma_1.prisma.user.findMany({ orderBy: { createdAt: "desc" }, skip, take }), prisma_1.prisma.user.count()]);
    }
    static async searchUsers(query) {
        return prisma_1.prisma.user.findMany({
            where: { OR: [{ telegramId: { contains: query } }, { username: { contains: query } }, { firstName: { contains: query } }, { lastName: { contains: query } }] },
            orderBy: { createdAt: "desc" },
            take: 10,
        });
    }
    static async listProducts(skip, take) {
        return Promise.all([prisma_1.prisma.product.findMany({ include: { category: true }, orderBy: { createdAt: "desc" }, skip, take }), prisma_1.prisma.product.count()]);
    }
    static async searchProducts(query) {
        return prisma_1.prisma.product.findMany({
            where: { OR: [{ title: { contains: query } }, { category: { is: { name: { contains: query } } } }] },
            include: { category: true },
            orderBy: { createdAt: "desc" },
            take: 10,
        });
    }
    static async listSubmittedDeposits() {
        return prisma_1.prisma.deposit.findMany({ where: { status: "submitted" }, include: { user: true }, orderBy: { createdAt: "desc" }, take: 20 });
    }
    static async listOpenTickets() {
        return prisma_1.prisma.ticket.findMany({ where: { status: "open" }, include: { user: true }, orderBy: { updatedAt: "desc" }, take: 20 });
    }
    static async listCoupons() {
        return prisma_1.prisma.coupon.findMany({ orderBy: { createdAt: "desc" }, take: 10 });
    }
    static async listRecentOrders() {
        return prisma_1.prisma.order.findMany({ include: { user: true, product: true }, orderBy: { createdAt: "desc" }, take: 20 });
    }
    static invalidateDashboardCache() {
        dashboardCache = undefined;
    }
    static async audit(actorId, action, metadata) {
        await prisma_1.prisma.auditLog.create({ data: { actorId, action, metadata: metadata === undefined ? undefined : JSON.stringify(metadata) } });
        this.invalidateDashboardCache();
    }
}
exports.AdminService = AdminService;
