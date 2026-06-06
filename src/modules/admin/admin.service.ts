import { prisma } from "../../services/prisma";
import { WalletService } from "../wallet/wallet.service";
import { CryptoWalletService, FinancialSettingsService } from "../deposit/deposit.service";
import { SystemSettingsService } from "../system/system.service";
import { CouponService } from "../coupon/coupon.service";
import { ForcedJoinService } from "../system/forced-join.service";

const DASHBOARD_CACHE_TTL_MS = 30_000;

type DashboardStats = {
  users: number;
  products: number;
  submittedDeposits: number;
  openTickets: number;
  orders: number;
  revenue: number;
  availableAccounts: number;
  soldAccounts: number;
  referralRewards: number;
  freeAccountsAvailable: number;
  freeAccountsAssigned: number;
};

let dashboardCache: { expiresAt: number; stats: DashboardStats } | undefined;

export class AdminService {
  static async dashboard(forceRefresh = false) {
    if (!forceRefresh && dashboardCache && dashboardCache.expiresAt > Date.now()) return dashboardCache.stats;

    const [users, products, submittedDeposits, openTickets, orders, revenue, availableAccounts, soldAccounts, referralRewards, freeAccountsAvailable, freeAccountsAssigned] = await Promise.all([
      prisma.user.count(),
      prisma.product.count(),
      prisma.deposit.count({ where: { status: "submitted" } }),
      prisma.ticket.count({ where: { status: "open" } }),
      prisma.order.count(),
      prisma.order.aggregate({ where: { status: "completed" }, _sum: { finalPaidAmount: true } }),
      prisma.productAccount.count({ where: { status: "available" } }),
      prisma.productAccount.count({ where: { status: "sold" } }),
      prisma.referralReward.aggregate({ _sum: { amount: true }, _count: true }),
      prisma.freeAccount.count({ where: { status: "available" } }),
      prisma.freeAccount.count({ where: { status: "assigned" } }),
    ]);

    const stats = { users, products, submittedDeposits, openTickets, orders, revenue: revenue._sum.finalPaidAmount ?? 0, availableAccounts, soldAccounts, referralRewards: referralRewards._sum.amount ?? 0, freeAccountsAvailable, freeAccountsAssigned };
    dashboardCache = { expiresAt: Date.now() + DASHBOARD_CACHE_TTL_MS, stats };
    return stats;
  }

  static async listUsers(page = 1, take = 8) {
    const skip = (page - 1) * take;
    return Promise.all([prisma.user.findMany({ orderBy: { createdAt: "desc" }, skip, take }), prisma.user.count()]);
  }

  static async userProfile(userId: string) {
    const [user, referralCount, transactions, orders] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId } }),
      prisma.referral.count({ where: { referrerId: userId } }),
      prisma.walletTransaction.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 6 }),
      prisma.order.findMany({ where: { userId }, include: { product: true }, orderBy: { createdAt: "desc" }, take: 6 }),
    ]);
    return { user, referralCount, transactions, orders };
  }

  static async adjustUserBalance(userId: string, amount: number, reason: string, actorId: string) {
    const user = amount >= 0 ? await WalletService.credit(userId, amount, reason) : await WalletService.debit(userId, Math.abs(amount), reason);
    await this.audit(actorId, "user.balance.adjust", { userId, amount, reason });
    return user;
  }

  static async setUserBan(userId: string, banned: boolean, actorId: string, reason?: string) {
    const user = await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({ where: { id: userId }, data: { isBanned: banned } });
      await tx.userBlockHistory.create({ data: { userId, actorId, blocked: banned, reason } });
      await tx.auditLog.create({ data: { actorId, action: banned ? "user.block" : "user.unblock", metadata: JSON.stringify({ userId, reason }) } });
      return updated;
    });
    SystemSettingsService.invalidateUserStatus(user.telegramId);
    this.invalidateDashboardCache();
    return user;
  }

  static async userBlockHistory(userId: string) {
    return prisma.userBlockHistory.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 20 });
  }

  static async searchUsers(query: string) {
    return prisma.user.findMany({
      where: { OR: [{ telegramId: { contains: query } }, { username: { contains: query } }, { firstName: { contains: query } }, { lastName: { contains: query } }] },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
  }

  static async listProducts(page = 1, take = 8) {
    const skip = (page - 1) * take;
    return Promise.all([prisma.product.findMany({ include: { category: true, _count: { select: { accounts: true } } }, orderBy: { createdAt: "desc" }, skip, take }), prisma.product.count()]);
  }

  static async productDetail(productId: string) {
    const [product, available, sold] = await Promise.all([
      prisma.product.findUnique({ where: { id: productId }, include: { category: true } }),
      prisma.productAccount.count({ where: { productId, status: "available" } }),
      prisma.productAccount.count({ where: { productId, status: "sold" } }),
    ]);
    return { product, available, sold };
  }

  static async searchProducts(query: string) {
    return prisma.product.findMany({
      where: { OR: [{ title: { contains: query } }, { category: { is: { name: { contains: query } } } }] },
      include: { category: true },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
  }

  static async setProductActive(productId: string, isActive: boolean, actorId: string) {
    const product = await prisma.product.update({ where: { id: productId }, data: { isActive } });
    await this.audit(actorId, isActive ? "product.activate" : "product.deactivate", { productId });
    return product;
  }

  static async updateProductPrice(productId: string, price: number, actorId: string) {
    const product = await prisma.product.update({ where: { id: productId }, data: { price } });
    await this.audit(actorId, "product.price.update", { productId, price });
    return product;
  }

  static async deleteProduct(productId: string, actorId: string) {
    const product = await prisma.product.update({ where: { id: productId }, data: { isActive: false } });
    await this.audit(actorId, "product.delete.soft", { productId });
    return product;
  }

  static async hardDeleteProduct(productId: string, actorId: string, force = false) {
    return prisma.$transaction(async (tx) => {
      const activeOrders = await tx.order.count({ where: { productId, status: "completed", items: { some: { isActive: true } } } });
      if (activeOrders > 0 && !force) throw new Error("این محصول در سفارش فعال استفاده شده است. برای حذف دائمی، تایید نهایی لازم است");
      const orders = await tx.order.findMany({ where: { productId }, select: { id: true } });
      const orderIds = orders.map((order) => order.id);
      if (orderIds.length) await tx.couponUsage.updateMany({ where: { orderId: { in: orderIds } }, data: { orderId: null } });
      await tx.orderItem.deleteMany({ where: { productId } });
      await tx.order.deleteMany({ where: { productId } });
      await tx.productAccount.deleteMany({ where: { productId } });
      const product = await tx.product.delete({ where: { id: productId } });
      await tx.auditLog.create({ data: { actorId, action: "product.delete.hard", metadata: JSON.stringify({ productId, force, activeOrders }) } });
      return product;
    });
  }

  static async listSubmittedDeposits(page = 1, take = 8) {
    const skip = (page - 1) * take;
    return Promise.all([
      prisma.deposit.findMany({ where: { status: "submitted" }, include: { user: true }, orderBy: { createdAt: "desc" }, skip, take }),
      prisma.deposit.count({ where: { status: "submitted" } }),
    ]);
  }

  static async depositDetail(depositId: string) {
    return prisma.deposit.findUnique({ where: { id: depositId }, include: { user: true } });
  }

  static async listOpenTickets(page = 1, take = 8) {
    const skip = (page - 1) * take;
    return Promise.all([
      prisma.ticket.findMany({ where: { status: "open" }, include: { user: true }, orderBy: { updatedAt: "desc" }, skip, take }),
      prisma.ticket.count({ where: { status: "open" } }),
    ]);
  }

  static async listCoupons(page = 1, take = 8, query?: string, status?: "active" | "inactive" | "deleted") {
    return CouponService.list({ page, take, query, status });
  }

  static async couponDetail(couponId: string) {
    return prisma.coupon.findUnique({ where: { id: couponId } });
  }

  static async listRecentOrders(page = 1, take = 8) {
    const skip = (page - 1) * take;
    return Promise.all([prisma.order.findMany({ include: { user: true, product: true }, orderBy: { createdAt: "desc" }, skip, take }), prisma.order.count()]);
  }

  static async listCryptoWallets() {
    return CryptoWalletService.listAll();
  }

  static async saveCryptoWallet(data: { coinName: string; networkName: string; walletAddress: string; status?: "active" | "inactive" }, actorId: string) {
    const wallet = await CryptoWalletService.upsert(data, actorId);
    this.invalidateDashboardCache();
    return wallet;
  }

  static async cryptoWalletStats() {
    const [wallets, setting] = await Promise.all([CryptoWalletService.listAll(), FinancialSettingsService.get()]);
    return { wallets, setting, supportedCoins: CryptoWalletService.supportedCoins() };
  }

  static async setStoreStatus(status: "active" | "inactive", actorId: string) {
    const setting = await SystemSettingsService.setStoreStatus(status, actorId);
    this.invalidateDashboardCache();
    return setting;
  }

  static async setMinimumTopupAmount(amount: number, actorId: string) {
    const setting = await FinancialSettingsService.setMinimumTopupAmount(amount, actorId);
    this.invalidateDashboardCache();
    return setting;
  }

  static async forcedJoinChannels() {
    return ForcedJoinService.listAll();
  }

  static async saveForcedJoinChannel(data: { chatId: string; title: string; inviteLink?: string; status?: "active" | "inactive" }, actorId: string) {
    return ForcedJoinService.upsert(data, actorId);
  }

  static async setForcedJoinStatus(channelId: string, status: "active" | "inactive", actorId: string) {
    return ForcedJoinService.setStatus(channelId, status, actorId);
  }

  static async deleteForcedJoinChannel(channelId: string, actorId: string) {
    return ForcedJoinService.delete(channelId, actorId);
  }

  static async accountStats() {
    const [available, sold, products] = await Promise.all([
      prisma.productAccount.count({ where: { status: "available" } }),
      prisma.productAccount.count({ where: { status: "sold" } }),
      prisma.product.findMany({ where: { isActive: true }, include: { _count: { select: { accounts: true } } }, orderBy: { title: "asc" }, take: 20 }),
    ]);
    return { available, sold, products };
  }

  static invalidateDashboardCache() {
    dashboardCache = undefined;
  }

  static async audit(actorId: string, action: string, metadata?: unknown) {
    await prisma.auditLog.create({ data: { actorId, action, metadata: metadata === undefined ? undefined : JSON.stringify(metadata) } });
    this.invalidateDashboardCache();
  }
}
