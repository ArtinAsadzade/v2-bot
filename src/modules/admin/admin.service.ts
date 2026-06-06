import { prisma } from "../../services/prisma";

const DASHBOARD_CACHE_TTL_MS = 30_000;

type DashboardStats = {
  users: number;
  products: number;
  submittedDeposits: number;
  openTickets: number;
  orders: number;
  revenue: number;
};

let dashboardCache: { expiresAt: number; stats: DashboardStats } | undefined;

export class AdminService {
  static async dashboard(forceRefresh = false) {
    if (!forceRefresh && dashboardCache && dashboardCache.expiresAt > Date.now()) {
      return dashboardCache.stats;
    }

    const [users, products, submittedDeposits, openTickets, orders, revenue] = await Promise.all([
      prisma.user.count(),
      prisma.product.count(),
      prisma.deposit.count({ where: { status: "submitted" } }),
      prisma.ticket.count({ where: { status: "open" } }),
      prisma.order.count(),
      prisma.order.aggregate({ where: { status: "completed" }, _sum: { totalAmount: true } }),
    ]);

    const stats = { users, products, submittedDeposits, openTickets, orders, revenue: revenue._sum.totalAmount ?? 0 };
    dashboardCache = { expiresAt: Date.now() + DASHBOARD_CACHE_TTL_MS, stats };
    return stats;
  }

  static invalidateDashboardCache() {
    dashboardCache = undefined;
  }

  static async audit(actorId: string, action: string, metadata?: unknown) {
    await prisma.auditLog.create({
      data: {
        actorId,
        action,
        metadata: metadata === undefined ? undefined : JSON.stringify(metadata),
      },
    });
    this.invalidateDashboardCache();
  }
}
