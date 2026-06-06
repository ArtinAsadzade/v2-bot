"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminService = void 0;
const prisma_1 = require("../../services/prisma");
const wallet_service_1 = require("../wallet/wallet.service");
const deposit_service_1 = require("../deposit/deposit.service");
const system_service_1 = require("../system/system.service");
const coupon_service_1 = require("../coupon/coupon.service");
const forced_join_service_1 = require("../system/forced-join.service");
const DASHBOARD_CACHE_TTL_MS = 30000;
let dashboardCache;
class AdminService {
    static async dashboard(forceRefresh = false) {
        if (!forceRefresh && dashboardCache && dashboardCache.expiresAt > Date.now())
            return dashboardCache.stats;
        const [users, products, submittedDeposits, openTickets, orders, revenue, availableAccounts, soldAccounts, referralRewards, freeAccountsAvailable, freeAccountsAssigned] = await Promise.all([
            prisma_1.prisma.user.count(),
            prisma_1.prisma.product.count(),
            prisma_1.prisma.deposit.count({ where: { status: "submitted" } }),
            prisma_1.prisma.ticket.count({ where: { status: "open" } }),
            prisma_1.prisma.order.count(),
            prisma_1.prisma.order.aggregate({ where: { status: "completed" }, _sum: { finalPaidAmount: true } }),
            prisma_1.prisma.productAccount.count({ where: { status: "available" } }),
            prisma_1.prisma.productAccount.count({ where: { status: "sold" } }),
            prisma_1.prisma.referralReward.aggregate({ _sum: { amount: true }, _count: true }),
            prisma_1.prisma.freeAccount.count({ where: { status: "available" } }),
            prisma_1.prisma.freeAccount.count({ where: { status: "assigned" } }),
        ]);
        const stats = { users, products, submittedDeposits, openTickets, orders, revenue: revenue._sum.finalPaidAmount ?? 0, availableAccounts, soldAccounts, referralRewards: referralRewards._sum.amount ?? 0, freeAccountsAvailable, freeAccountsAssigned };
        dashboardCache = { expiresAt: Date.now() + DASHBOARD_CACHE_TTL_MS, stats };
        return stats;
    }
    static async listUsers(page = 1, take = 8) {
        const skip = (page - 1) * take;
        return Promise.all([prisma_1.prisma.user.findMany({ orderBy: { createdAt: "desc" }, skip, take }), prisma_1.prisma.user.count()]);
    }
    static async userProfile(userId) {
        const [user, referralCount, transactions, orders] = await Promise.all([
            prisma_1.prisma.user.findUnique({ where: { id: userId } }),
            prisma_1.prisma.referral.count({ where: { referrerId: userId } }),
            prisma_1.prisma.walletTransaction.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 6 }),
            prisma_1.prisma.order.findMany({ where: { userId }, include: { product: true }, orderBy: { createdAt: "desc" }, take: 6 }),
        ]);
        return { user, referralCount, transactions, orders };
    }
    static async adjustUserBalance(userId, amount, reason, actorId) {
        const user = amount >= 0 ? await wallet_service_1.WalletService.credit(userId, amount, reason) : await wallet_service_1.WalletService.debit(userId, Math.abs(amount), reason);
        await this.audit(actorId, "user.balance.adjust", { userId, amount, reason });
        return user;
    }
    static async setUserBan(userId, banned, actorId, reason) {
        const user = await prisma_1.prisma.$transaction(async (tx) => {
            const updated = await tx.user.update({ where: { id: userId }, data: { isBanned: banned } });
            await tx.userBlockHistory.create({ data: { userId, actorId, blocked: banned, reason } });
            await tx.auditLog.create({ data: { actorId, action: banned ? "user.block" : "user.unblock", metadata: JSON.stringify({ userId, reason }) } });
            return updated;
        });
        system_service_1.SystemSettingsService.invalidateUserStatus(user.telegramId);
        this.invalidateDashboardCache();
        return user;
    }
    static async userBlockHistory(userId) {
        return prisma_1.prisma.userBlockHistory.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 20 });
    }
    static async searchUsers(query) {
        return prisma_1.prisma.user.findMany({
            where: { OR: [{ telegramId: { contains: query } }, { username: { contains: query } }, { firstName: { contains: query } }, { lastName: { contains: query } }] },
            orderBy: { createdAt: "desc" },
            take: 10,
        });
    }
    static async listProducts(page = 1, take = 8) {
        const skip = (page - 1) * take;
        return Promise.all([prisma_1.prisma.product.findMany({ include: { category: true, _count: { select: { accounts: true } } }, orderBy: { createdAt: "desc" }, skip, take }), prisma_1.prisma.product.count()]);
    }
    static async productDetail(productId) {
        const [product, available, sold] = await Promise.all([
            prisma_1.prisma.product.findUnique({ where: { id: productId }, include: { category: true } }),
            prisma_1.prisma.productAccount.count({ where: { productId, status: "available" } }),
            prisma_1.prisma.productAccount.count({ where: { productId, status: "sold" } }),
        ]);
        return { product, available, sold };
    }
    static async searchProducts(query) {
        return prisma_1.prisma.product.findMany({
            where: { OR: [{ title: { contains: query } }, { category: { is: { name: { contains: query } } } }] },
            include: { category: true },
            orderBy: { createdAt: "desc" },
            take: 10,
        });
    }
    static async setProductActive(productId, isActive, actorId) {
        const product = await prisma_1.prisma.product.update({ where: { id: productId }, data: { isActive } });
        await this.audit(actorId, isActive ? "product.activate" : "product.deactivate", { productId });
        return product;
    }
    static async updateProductPrice(productId, price, actorId) {
        const product = await prisma_1.prisma.product.update({ where: { id: productId }, data: { price } });
        await this.audit(actorId, "product.price.update", { productId, price });
        return product;
    }
    static async deleteProduct(productId, actorId) {
        const product = await prisma_1.prisma.product.update({ where: { id: productId }, data: { isActive: false } });
        await this.audit(actorId, "product.delete.soft", { productId });
        return product;
    }
    static async hardDeleteProduct(productId, actorId, force = false) {
        return prisma_1.prisma.$transaction(async (tx) => {
            const activeOrders = await tx.order.count({ where: { productId, status: "completed", items: { some: { isActive: true } } } });
            if (activeOrders > 0 && !force)
                throw new Error("این محصول در سفارش فعال استفاده شده است. برای حذف دائمی، تایید نهایی لازم است");
            const orders = await tx.order.findMany({ where: { productId }, select: { id: true } });
            const orderIds = orders.map((order) => order.id);
            if (orderIds.length)
                await tx.couponUsage.updateMany({ where: { orderId: { in: orderIds } }, data: { orderId: null } });
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
            prisma_1.prisma.deposit.findMany({ where: { status: "submitted" }, include: { user: true }, orderBy: { createdAt: "desc" }, skip, take }),
            prisma_1.prisma.deposit.count({ where: { status: "submitted" } }),
        ]);
    }
    static async depositDetail(depositId) {
        return prisma_1.prisma.deposit.findUnique({ where: { id: depositId }, include: { user: true } });
    }
    static async listOpenTickets(page = 1, take = 8) {
        const skip = (page - 1) * take;
        return Promise.all([
            prisma_1.prisma.ticket.findMany({ where: { status: "open" }, include: { user: true }, orderBy: { updatedAt: "desc" }, skip, take }),
            prisma_1.prisma.ticket.count({ where: { status: "open" } }),
        ]);
    }
    static async listCoupons(page = 1, take = 8, query, status) {
        return coupon_service_1.CouponService.list({ page, take, query, status });
    }
    static async couponDetail(couponId) {
        return prisma_1.prisma.coupon.findUnique({ where: { id: couponId } });
    }
    static async listRecentOrders(page = 1, take = 8) {
        const skip = (page - 1) * take;
        return Promise.all([prisma_1.prisma.order.findMany({ include: { user: true, product: true }, orderBy: { createdAt: "desc" }, skip, take }), prisma_1.prisma.order.count()]);
    }
    static async listCryptoWallets() {
        return deposit_service_1.CryptoWalletService.listAll();
    }
    static async saveCryptoWallet(data, actorId) {
        const wallet = await deposit_service_1.CryptoWalletService.upsert(data, actorId);
        this.invalidateDashboardCache();
        return wallet;
    }
    static async cryptoWalletStats() {
        const [wallets, setting] = await Promise.all([deposit_service_1.CryptoWalletService.listAll(), deposit_service_1.FinancialSettingsService.get()]);
        return { wallets, setting, supportedCoins: deposit_service_1.CryptoWalletService.supportedCoins() };
    }
    static async setStoreStatus(status, actorId) {
        const setting = await system_service_1.SystemSettingsService.setStoreStatus(status, actorId);
        this.invalidateDashboardCache();
        return setting;
    }
    static async setMinimumTopupAmount(amount, actorId) {
        const setting = await deposit_service_1.FinancialSettingsService.setMinimumTopupAmount(amount, actorId);
        this.invalidateDashboardCache();
        return setting;
    }
    static async forcedJoinChannels() {
        return forced_join_service_1.ForcedJoinService.listAll();
    }
    static async saveForcedJoinChannel(data, actorId) {
        return forced_join_service_1.ForcedJoinService.upsert(data, actorId);
    }
    static async setForcedJoinStatus(channelId, status, actorId) {
        return forced_join_service_1.ForcedJoinService.setStatus(channelId, status, actorId);
    }
    static async deleteForcedJoinChannel(channelId, actorId) {
        return forced_join_service_1.ForcedJoinService.delete(channelId, actorId);
    }
    static async accountStats() {
        const [available, sold, products] = await Promise.all([
            prisma_1.prisma.productAccount.count({ where: { status: "available" } }),
            prisma_1.prisma.productAccount.count({ where: { status: "sold" } }),
            prisma_1.prisma.product.findMany({ where: { isActive: true }, include: { _count: { select: { accounts: true } } }, orderBy: { title: "asc" }, take: 20 }),
        ]);
        return { available, sold, products };
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
