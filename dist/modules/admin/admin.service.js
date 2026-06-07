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
function containsQuery(query) {
    return query?.trim() || undefined;
}
class AdminService {
    static async dashboard(forceRefresh = false) {
        if (!forceRefresh && dashboardCache && dashboardCache.expiresAt > Date.now())
            return dashboardCache.stats;
        const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
        const [users, products, categories, wallets, submittedDeposits, openTickets, orders, revenue, availableAccounts, soldAccounts, disabledAccounts, referralRewards, freeAccountsAvailable, freeAccountsAssigned, freeAccountsExpired, freeAccountsMonthly, freeAccountUniqueRows] = await Promise.all([
            prisma_1.prisma.user.count(),
            prisma_1.prisma.product.count({ where: { deletedAt: null } }),
            prisma_1.prisma.category.count({ where: { deletedAt: null } }),
            prisma_1.prisma.cryptoWallet.count(),
            prisma_1.prisma.deposit.count({ where: { status: "submitted" } }),
            prisma_1.prisma.ticket.count({ where: { status: "open" } }),
            prisma_1.prisma.order.count(),
            prisma_1.prisma.order.aggregate({ where: { status: "completed" }, _sum: { finalPaidAmount: true } }),
            prisma_1.prisma.productAccount.count({ where: { status: "available" } }),
            prisma_1.prisma.productAccount.count({ where: { status: "sold" } }),
            prisma_1.prisma.productAccount.count({ where: { status: "disabled" } }),
            prisma_1.prisma.referralReward.aggregate({ _sum: { amount: true }, _count: true }),
            prisma_1.prisma.freeAccount.count({ where: { status: "available" } }),
            prisma_1.prisma.freeAccount.count({ where: { status: "assigned" } }),
            prisma_1.prisma.freeAccount.count({ where: { status: "expired" } }),
            prisma_1.prisma.freeAccountAssignment.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
            prisma_1.prisma.freeAccountAssignment.findMany({ distinct: ["userId"], select: { userId: true } }),
        ]);
        const stats = { users, products, categories, wallets, submittedDeposits, openTickets, orders, revenue: revenue._sum.finalPaidAmount ?? 0, availableAccounts, soldAccounts, disabledAccounts, referralRewards: referralRewards._sum.amount ?? 0, freeAccountsAvailable, freeAccountsAssigned, freeAccountsExpired, freeAccountsMonthly, freeAccountsUniqueUsers: freeAccountUniqueRows.length };
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
    static async listCategories(page = 1, take = 8, query) {
        const skip = (page - 1) * take;
        const q = containsQuery(query);
        const where = { deletedAt: null, ...(q ? { OR: [{ name: { contains: q } }, { description: { contains: q } }] } : {}) };
        return Promise.all([
            prisma_1.prisma.category.findMany({ where, include: { _count: { select: { products: true } } }, orderBy: [{ displayOrder: "asc" }, { createdAt: "desc" }], skip, take }),
            prisma_1.prisma.category.count({ where }),
        ]);
    }
    static async categoryDetail(categoryId) {
        const [category, productCount, activeProductCount, salesCount, products] = await Promise.all([
            prisma_1.prisma.category.findUnique({ where: { id: categoryId } }),
            prisma_1.prisma.product.count({ where: { categoryId, deletedAt: null } }),
            prisma_1.prisma.product.count({ where: { categoryId, deletedAt: null, isActive: true } }),
            prisma_1.prisma.order.count({ where: { product: { is: { categoryId } }, status: "completed" } }),
            prisma_1.prisma.product.findMany({ where: { categoryId, deletedAt: null }, include: { _count: { select: { accounts: true, orders: true } } }, orderBy: { createdAt: "desc" }, take: 10 }),
        ]);
        return { category, productCount, activeProductCount, salesCount, products };
    }
    static async saveCategory(data, actorId, categoryId) {
        const payload = { name: data.name.trim(), description: data.description?.trim(), icon: data.icon?.trim(), displayOrder: data.displayOrder ?? 0, isActive: data.isActive ?? true, deletedAt: null };
        if (!payload.name)
            throw new Error("عنوان دسته‌بندی الزامی است");
        const category = categoryId ? await prisma_1.prisma.category.update({ where: { id: categoryId }, data: payload }) : await prisma_1.prisma.category.create({ data: payload });
        await this.audit(actorId, categoryId ? "category.update" : "category.create", { categoryId: category.id });
        return category;
    }
    static async setCategoryActive(categoryId, isActive, actorId) {
        const category = await prisma_1.prisma.category.update({ where: { id: categoryId }, data: { isActive } });
        await this.audit(actorId, isActive ? "category.activate" : "category.deactivate", { categoryId });
        return category;
    }
    static async deleteCategory(categoryId, actorId) {
        const category = await prisma_1.prisma.category.update({ where: { id: categoryId }, data: { isActive: false, deletedAt: new Date() } });
        await this.audit(actorId, "category.delete.soft", { categoryId });
        return category;
    }
    static async hardDeleteCategory(categoryId, actorId, force = false) {
        return prisma_1.prisma.$transaction(async (tx) => {
            const productCount = await tx.product.count({ where: { categoryId } });
            if (productCount && !force)
                throw new Error("این دسته‌بندی محصول دارد. برای حذف دائمی تایید نهایی لازم است");
            if (force) {
                const products = await tx.product.findMany({ where: { categoryId }, select: { id: true } });
                for (const product of products) {
                    await tx.orderItem.deleteMany({ where: { productId: product.id } });
                    await tx.order.deleteMany({ where: { productId: product.id } });
                    await tx.productAccountHistory.deleteMany({ where: { account: { is: { productId: product.id } } } });
                    await tx.productAccount.deleteMany({ where: { productId: product.id } });
                }
                await tx.product.deleteMany({ where: { categoryId } });
            }
            const category = await tx.category.delete({ where: { id: categoryId } });
            await tx.auditLog.create({ data: { actorId, action: "category.delete.hard", metadata: JSON.stringify({ categoryId, force, productCount }) } });
            return category;
        });
    }
    static async listProducts(page = 1, take = 8, query, status) {
        const skip = (page - 1) * take;
        const q = containsQuery(query);
        const where = { ...(status === "deleted" ? { deletedAt: { not: null } } : { deletedAt: null }), ...(status === "active" ? { isActive: true } : {}), ...(status === "inactive" ? { isActive: false } : {}), ...(q ? { OR: [{ title: { contains: q } }, { category: { is: { name: { contains: q } } } }] } : {}) };
        return Promise.all([prisma_1.prisma.product.findMany({ where, include: { category: true, _count: { select: { accounts: true, orders: true } } }, orderBy: { createdAt: "desc" }, skip, take }), prisma_1.prisma.product.count({ where })]);
    }
    static async productDetail(productId) {
        const [product, available, sold, disabled, expired, activeAccounts, soldAccounts, revenue] = await Promise.all([
            prisma_1.prisma.product.findUnique({ where: { id: productId }, include: { category: true, _count: { select: { accounts: true, orders: true } } } }),
            prisma_1.prisma.productAccount.count({ where: { productId, status: "available" } }),
            prisma_1.prisma.productAccount.count({ where: { productId, status: "sold" } }),
            prisma_1.prisma.productAccount.count({ where: { productId, status: "disabled" } }),
            prisma_1.prisma.productAccount.count({ where: { productId, status: "expired" } }),
            prisma_1.prisma.productAccount.findMany({ where: { productId, status: { in: ["available", "reserved"] } }, orderBy: { createdAt: "desc" }, take: 5 }),
            prisma_1.prisma.productAccount.findMany({ where: { productId, status: "sold" }, orderBy: { soldAt: "desc" }, take: 5 }),
            prisma_1.prisma.order.aggregate({ where: { productId, status: "completed" }, _sum: { finalPaidAmount: true } }),
        ]);
        return { product, available, sold, disabled, expired, activeAccounts, soldAccounts, revenue: revenue._sum.finalPaidAmount ?? 0 };
    }
    static async searchProducts(query) {
        return prisma_1.prisma.product.findMany({ where: { deletedAt: null, OR: [{ title: { contains: query } }, { category: { is: { name: { contains: query } } } }] }, include: { category: true }, orderBy: { createdAt: "desc" }, take: 10 });
    }
    static async updateProduct(productId, data, actorId) {
        const product = await prisma_1.prisma.product.update({ where: { id: productId }, data });
        await this.audit(actorId, "product.update", { productId, data });
        return product;
    }
    static async setProductActive(productId, isActive, actorId) {
        const product = await prisma_1.prisma.product.update({ where: { id: productId }, data: { isActive, ...(isActive ? { deletedAt: null } : {}) } });
        await this.audit(actorId, isActive ? "product.activate" : "product.deactivate", { productId });
        return product;
    }
    static async updateProductPrice(productId, price, actorId) {
        return this.updateProduct(productId, { price }, actorId);
    }
    static async deleteProduct(productId, actorId) {
        const product = await prisma_1.prisma.product.update({ where: { id: productId }, data: { isActive: false, deletedAt: new Date() } });
        await this.audit(actorId, "product.delete.soft", { productId });
        return product;
    }
    static async duplicateProduct(productId, actorId) {
        const source = await prisma_1.prisma.product.findUniqueOrThrow({ where: { id: productId } });
        const product = await prisma_1.prisma.product.create({ data: { categoryId: source.categoryId, title: `${source.title} - کپی`, price: source.price, duration: source.duration, isActive: false } });
        await this.audit(actorId, "product.duplicate", { productId, duplicateId: product.id });
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
            await tx.productAccountHistory.deleteMany({ where: { account: { is: { productId } } } });
            await tx.productAccount.deleteMany({ where: { productId } });
            const product = await tx.product.delete({ where: { id: productId } });
            await tx.auditLog.create({ data: { actorId, action: "product.delete.hard", metadata: JSON.stringify({ productId, force, activeOrders }) } });
            return product;
        });
    }
    static async listAccounts(page = 1, take = 8, query, status) {
        const skip = (page - 1) * take;
        const q = containsQuery(query);
        const where = { ...(status ? { status } : {}), ...(q ? { OR: [{ username: { contains: q } }, { subscriptionLink: { contains: q } }, { configLink: { contains: q } }, { product: { is: { title: { contains: q } } } }] } : {}) };
        return Promise.all([prisma_1.prisma.productAccount.findMany({ where, include: { product: true }, orderBy: { createdAt: "desc" }, skip, take }), prisma_1.prisma.productAccount.count({ where })]);
    }
    static async accountDetail(accountId) {
        return prisma_1.prisma.productAccount.findUnique({ where: { id: accountId }, include: { product: true, history: { orderBy: { createdAt: "desc" }, take: 10 } } });
    }
    static async updateAccount(accountId, data, actorId) {
        return prisma_1.prisma.$transaction(async (tx) => {
            const current = await tx.productAccount.findUniqueOrThrow({ where: { id: accountId } });
            const update = { ...data, ...(data.configLink ? { config: data.configLink } : {}) };
            const account = await tx.productAccount.update({ where: { id: accountId }, data: update });
            if (data.productId && data.productId !== current.productId)
                await tx.productAccountHistory.create({ data: { accountId, actorId, action: "account.move", fromValue: current.productId, toValue: data.productId } });
            else
                await tx.productAccountHistory.create({ data: { accountId, actorId, action: "account.update", metadata: JSON.stringify(data) } });
            return account;
        });
    }
    static async setAccountStatus(accountId, status, actorId) {
        const account = await prisma_1.prisma.$transaction(async (tx) => {
            const current = await tx.productAccount.findUniqueOrThrow({ where: { id: accountId } });
            const updated = await tx.productAccount.update({ where: { id: accountId }, data: { status, ...(status === "available" ? { reservedBy: null, reservedAt: null } : {}) } });
            await tx.productAccountHistory.create({ data: { accountId, actorId, action: "account.status", fromValue: current.status, toValue: status } });
            return updated;
        });
        this.invalidateDashboardCache();
        return account;
    }
    static async deleteAccount(accountId, actorId) {
        const account = await prisma_1.prisma.$transaction(async (tx) => {
            await tx.productAccountHistory.deleteMany({ where: { accountId } });
            return tx.productAccount.delete({ where: { id: accountId } });
        });
        await this.audit(actorId, "product_account.delete", { accountId });
        return account;
    }
    static async listSubmittedDeposits(page = 1, take = 8) {
        const skip = (page - 1) * take;
        return Promise.all([prisma_1.prisma.deposit.findMany({ where: { status: "submitted" }, include: { user: true }, orderBy: { createdAt: "desc" }, skip, take }), prisma_1.prisma.deposit.count({ where: { status: "submitted" } })]);
    }
    static async depositDetail(depositId) {
        return prisma_1.prisma.deposit.findUnique({ where: { id: depositId }, include: { user: true } });
    }
    static async listTickets(page = 1, take = 8, status) {
        const skip = (page - 1) * take;
        const where = status ? { status } : {};
        return Promise.all([prisma_1.prisma.ticket.findMany({ where, include: { user: true, messages: { orderBy: { createdAt: "desc" }, take: 1 } }, orderBy: { updatedAt: "desc" }, skip, take }), prisma_1.prisma.ticket.count({ where })]);
    }
    static async listOpenTickets(page = 1, take = 8) {
        return this.listTickets(page, take, "open");
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
    static async listCryptoWallets(page = 1, take = 8, query) {
        const skip = (page - 1) * take;
        const q = containsQuery(query);
        const where = q ? { OR: [{ coinName: { contains: q } }, { coinSymbol: { contains: q } }, { networkName: { contains: q } }, { displayName: { contains: q } }, { walletAddress: { contains: q } }] } : {};
        return Promise.all([prisma_1.prisma.cryptoWallet.findMany({ where, orderBy: [{ displayOrder: "asc" }, { coinName: "asc" }], skip, take }), prisma_1.prisma.cryptoWallet.count({ where })]);
    }
    static async walletDetail(walletId) {
        const [wallet, pendingDeposits, activePayments, deposits] = await Promise.all([
            prisma_1.prisma.cryptoWallet.findUnique({ where: { id: walletId } }),
            prisma_1.prisma.deposit.count({ where: { cryptoWalletId: walletId, status: { in: ["pending", "submitted"] } } }),
            prisma_1.prisma.deposit.count({ where: { cryptoWalletId: walletId, status: "submitted" } }),
            prisma_1.prisma.deposit.count({ where: { cryptoWalletId: walletId } }),
        ]);
        return { wallet, pendingDeposits, activePayments, deposits };
    }
    static async saveCryptoWallet(data, actorId, walletId) {
        const coinName = data.coinName.trim().toUpperCase();
        const networkName = data.networkName.trim().toUpperCase();
        const walletAddress = data.walletAddress.trim();
        if (!coinName || !networkName || !walletAddress)
            throw new Error("اطلاعات کیف پول کامل نیست");
        const payload = { coinName, coinSymbol: (data.coinSymbol ?? coinName).trim().toUpperCase(), networkName, displayName: data.displayName?.trim() || `${coinName} ${networkName}`, walletAddress, displayOrder: data.displayOrder ?? 0, status: data.status ?? "active" };
        const wallet = walletId ? await prisma_1.prisma.cryptoWallet.update({ where: { id: walletId }, data: payload }) : await deposit_service_1.CryptoWalletService.upsert(payload, actorId);
        if (walletId)
            await this.audit(actorId, "crypto_wallet.update", { walletId });
        this.invalidateDashboardCache();
        return wallet;
    }
    static async setCryptoWalletStatus(walletId, status, actorId) {
        const wallet = await deposit_service_1.CryptoWalletService.setStatus(walletId, status, actorId);
        this.invalidateDashboardCache();
        return wallet;
    }
    static async deleteCryptoWallet(walletId, actorId, force = false) {
        const safety = await this.walletDetail(walletId);
        if (!safety.wallet)
            throw new Error("کیف پول پیدا نشد");
        if ((safety.pendingDeposits > 0 || safety.activePayments > 0) && !force)
            throw new Error("این کیف پول پرداخت در جریان دارد. ابتدا پرداخت‌ها را تعیین وضعیت کنید یا تایید نهایی حذف را بزنید");
        const wallet = await prisma_1.prisma.cryptoWallet.delete({ where: { id: walletId } });
        await this.audit(actorId, "crypto_wallet.delete", { walletId, force, pendingDeposits: safety.pendingDeposits, activePayments: safety.activePayments });
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
        const [available, sold, disabled, expired, products] = await Promise.all([
            prisma_1.prisma.productAccount.count({ where: { status: "available" } }),
            prisma_1.prisma.productAccount.count({ where: { status: "sold" } }),
            prisma_1.prisma.productAccount.count({ where: { status: "disabled" } }),
            prisma_1.prisma.productAccount.count({ where: { status: "expired" } }),
            prisma_1.prisma.product.findMany({ where: { isActive: true, deletedAt: null }, include: { _count: { select: { accounts: true } } }, orderBy: { title: "asc" }, take: 20 }),
        ]);
        return { available, sold, disabled, expired, products };
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
