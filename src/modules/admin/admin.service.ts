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
    if (!forceRefresh && dashboardCache && dashboardCache.expiresAt > Date.now()) return dashboardCache.stats;

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

  static async listUsers(skip: number, take: number) {
    return Promise.all([prisma.user.findMany({ orderBy: { createdAt: "desc" }, skip, take }), prisma.user.count()]);
  }

  static async searchUsers(query: string) {
    return prisma.user.findMany({
      where: { OR: [{ telegramId: { contains: query } }, { username: { contains: query } }, { firstName: { contains: query } }, { lastName: { contains: query } }] },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
  }

  static async listProducts(skip: number, take: number) {
    return Promise.all([prisma.product.findMany({ include: { category: true }, orderBy: { createdAt: "desc" }, skip, take }), prisma.product.count()]);
  }

  static async searchProducts(query: string) {
    return prisma.product.findMany({
      where: { OR: [{ title: { contains: query } }, { category: { is: { name: { contains: query } } } }] },
      include: { category: true },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
  }

  static async listSubmittedDeposits() {
    return prisma.deposit.findMany({ where: { status: "submitted" }, include: { user: true }, orderBy: { createdAt: "desc" }, take: 20 });
  }

  static async listOpenTickets() {
    return prisma.ticket.findMany({ where: { status: "open" }, include: { user: true }, orderBy: { updatedAt: "desc" }, take: 20 });
  }

  static async listCoupons() {
    return prisma.coupon.findMany({ orderBy: { createdAt: "desc" }, take: 10 });
  }

  static async listRecentOrders() {
    return prisma.order.findMany({ include: { user: true, product: true }, orderBy: { createdAt: "desc" }, take: 20 });
  }

  static invalidateDashboardCache() {
    dashboardCache = undefined;
  }

  static async audit(actorId: string, action: string, metadata?: unknown) {
    await prisma.auditLog.create({ data: { actorId, action, metadata: metadata === undefined ? undefined : JSON.stringify(metadata) } });
    this.invalidateDashboardCache();
  }
}
