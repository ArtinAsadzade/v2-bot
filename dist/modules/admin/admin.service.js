"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminService = void 0;
const prisma_1 = require("../../services/prisma");
const wallet_service_1 = require("../wallet/wallet.service");
const deposit_service_1 = require("../deposit/deposit.service");
const system_service_1 = require("../system/system.service");
const coupon_service_1 = require("../coupon/coupon.service");
const forced_join_service_1 = require("../system/forced-join.service");
const visibility_1 = require("../product/visibility");
const xray_service_1 = require("../xray/xray.service");
const DASHBOARD_CACHE_TTL_MS = 30000;
let dashboardCache;
function containsQuery(query) {
    return query?.trim() || undefined;
}
function cleanUndefined(data) {
    return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
}
const COMPLETED_PURCHASED_ACCOUNT_WHERE = { items: { some: { order: { is: { status: "completed" } } } } };
function purchasedInventoryWhere(productId) {
    return {
        ...(productId ? { productId } : {}),
        OR: [{ status: "sold" }, COMPLETED_PURCHASED_ACCOUNT_WHERE],
    };
}
function sellableInventoryWhere(productId) {
    return {
        ...(productId ? { productId } : {}),
        AND: [(0, visibility_1.availableInventoryWhere)(productId), (0, visibility_1.unassignedInventoryWhere)()],
        NOT: COMPLETED_PURCHASED_ACCOUNT_WHERE,
    };
}
function activePurchasedInventoryWhere(productId, now = new Date()) {
    return {
        ...(productId ? { productId } : {}),
        NOT: { status: { in: ["disabled", "expired"] } },
        items: { some: { order: { is: { status: "completed" } }, isActive: true, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } },
    };
}
function normalizePurchasedStatus(account, now = new Date()) {
    const completedItem = account.items?.find((item) => item.order.status === "completed");
    if (!completedItem)
        return account.status;
    if (account.status === "disabled")
        return "disabled";
    if (account.status === "expired" || !completedItem.isActive || (completedItem.expiresAt && completedItem.expiresAt <= now))
        return "expired";
    return "sold";
}
class AdminService {
    static async dashboard(forceRefresh = false) {
        if (!forceRefresh && dashboardCache && dashboardCache.expiresAt > Date.now())
            return dashboardCache.stats;
        const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
        const [users, products, categories, wallets, submittedDeposits, openTickets, orders, revenue, totalAccounts, availableAccounts, reservedAccounts, soldAccounts, disabledAccounts, expiredAccounts, referralRewards, freeAccountsAvailable, freeAccountsAssigned, freeAccountsExpired, freeAccountsMonthly, freeAccountUniqueRows] = await Promise.all([
            prisma_1.prisma.user.count(),
            prisma_1.prisma.product.count({ where: (0, visibility_1.productNotDeletedWhere)() }),
            prisma_1.prisma.category.count({ where: (0, visibility_1.categoryNotDeletedWhere)() }),
            prisma_1.prisma.cryptoWallet.count(),
            prisma_1.prisma.deposit.count({ where: { status: "submitted" } }),
            prisma_1.prisma.ticket.count({ where: { status: "open" } }),
            prisma_1.prisma.order.count(),
            prisma_1.prisma.order.aggregate({ where: { status: "completed" }, _sum: { finalPaidAmount: true } }),
            prisma_1.prisma.productAccount.count(),
            prisma_1.prisma.productAccount.count({ where: (0, visibility_1.availableInventoryWhere)() }),
            prisma_1.prisma.productAccount.count({ where: { status: "reserved" } }),
            prisma_1.prisma.productAccount.count({ where: { status: "sold" } }),
            prisma_1.prisma.productAccount.count({ where: { status: "disabled" } }),
            prisma_1.prisma.productAccount.count({ where: { status: "expired" } }),
            prisma_1.prisma.referralReward.aggregate({ _sum: { amount: true }, _count: true }),
            prisma_1.prisma.freeAccount.count({ where: { status: "available" } }),
            prisma_1.prisma.freeAccount.count({ where: { status: "assigned" } }),
            prisma_1.prisma.freeAccount.count({ where: { status: "expired" } }),
            prisma_1.prisma.freeAccountAssignment.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
            prisma_1.prisma.freeAccountAssignment.findMany({ distinct: ["userId"], select: { userId: true } }),
        ]);
        const stats = { users, products, categories, wallets, submittedDeposits, openTickets, orders, revenue: revenue._sum.finalPaidAmount ?? 0, totalAccounts, availableAccounts, reservedAccounts, soldAccounts, disabledAccounts, expiredAccounts, referralRewards: referralRewards._sum.amount ?? 0, freeAccountsAvailable, freeAccountsAssigned, freeAccountsExpired, freeAccountsMonthly, freeAccountsUniqueUsers: freeAccountUniqueRows.length };
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
        const where = { AND: [(0, visibility_1.categoryNotDeletedWhere)(), ...(q ? [{ OR: [{ name: { contains: q } }, { description: { contains: q } }] }] : [])] };
        const [categories, total] = await Promise.all([
            prisma_1.prisma.category.findMany({ where, include: { _count: { select: { products: true } } }, orderBy: [{ displayOrder: "asc" }, { createdAt: "desc" }], skip, take }),
            prisma_1.prisma.category.count({ where }),
        ]);
        const categoryIds = categories.map((category) => category.id);
        const activeGroups = categoryIds.length
            ? await prisma_1.prisma.product.groupBy({ by: ["categoryId"], where: { categoryId: { in: categoryIds }, AND: [(0, visibility_1.activeProductWhere)()] }, _count: { _all: true } })
            : [];
        const activeCounts = new Map(activeGroups.map((group) => [group.categoryId, group._count._all]));
        return [categories.map((category) => ({ ...category, activeProductCount: activeCounts.get(category.id) ?? 0 })), total];
    }
    static async categoryDetail(categoryId, productPage = 1, productTake = 8) {
        const skip = (productPage - 1) * productTake;
        const [category, productCount, activeProductCount, salesCount, products] = await Promise.all([
            prisma_1.prisma.category.findUnique({ where: { id: categoryId } }),
            prisma_1.prisma.product.count({ where: { categoryId, AND: [(0, visibility_1.productNotDeletedWhere)()] } }),
            prisma_1.prisma.product.count({ where: { categoryId, AND: [(0, visibility_1.activeProductWhere)()] } }),
            prisma_1.prisma.order.count({ where: { product: { is: { categoryId } }, status: "completed" } }),
            prisma_1.prisma.product.findMany({ where: { categoryId, AND: [(0, visibility_1.productNotDeletedWhere)()] }, include: { _count: { select: { accounts: true, orders: true } } }, orderBy: { createdAt: "desc" }, skip, take: productTake }),
        ]);
        return { category, productCount, activeProductCount, salesCount, products, productPage, productTake };
    }
    static async saveCategory(data, actorId, categoryId) {
        const name = data.name?.trim();
        if (!categoryId && !name)
            throw new Error("عنوان دسته‌بندی الزامی است");
        const updateData = cleanUndefined({
            name: name || undefined,
            description: data.description?.trim(),
            icon: data.icon?.trim(),
            displayOrder: data.displayOrder,
            isActive: data.isActive,
            deletedAt: null,
        });
        const category = categoryId
            ? await prisma_1.prisma.category.update({ where: { id: categoryId }, data: updateData })
            : await prisma_1.prisma.category.upsert({
                where: { name: name },
                update: { ...updateData, deletedAt: null },
                create: { name: name, description: data.description?.trim(), icon: data.icon?.trim(), displayOrder: data.displayOrder ?? 0, isActive: data.isActive ?? true },
            });
        await this.audit(actorId, categoryId ? "category.update" : "category.create", { categoryId: category.id });
        return category;
    }
    static async setCategoryActive(categoryId, isActive, actorId) {
        const category = await prisma_1.prisma.$transaction(async (tx) => {
            const updated = await tx.category.update({ where: { id: categoryId }, data: { isActive, ...(isActive ? { deletedAt: null } : {}) } });
            await tx.product.updateMany({ where: { categoryId, ...(isActive ? {} : (0, visibility_1.productNotDeletedWhere)()) }, data: { isActive, ...(isActive ? { deletedAt: null } : {}) } });
            await tx.auditLog.create({ data: { actorId, action: isActive ? "category.activate" : "category.deactivate", metadata: JSON.stringify({ categoryId, synchronizedProducts: true }) } });
            return updated;
        });
        this.invalidateDashboardCache();
        return category;
    }
    static async deleteCategory(categoryId, actorId) {
        const deletedAt = new Date();
        const category = await prisma_1.prisma.$transaction(async (tx) => {
            const updated = await tx.category.update({ where: { id: categoryId }, data: { isActive: false, deletedAt } });
            await tx.product.updateMany({ where: { categoryId, AND: [(0, visibility_1.productNotDeletedWhere)()] }, data: { isActive: false, deletedAt } });
            await tx.auditLog.create({ data: { actorId, action: "category.delete.soft", metadata: JSON.stringify({ categoryId, synchronizedProducts: true }) } });
            return updated;
        });
        this.invalidateDashboardCache();
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
                    const orders = await tx.order.findMany({ where: { productId: product.id }, select: { id: true } });
                    const orderIds = orders.map((order) => order.id);
                    if (orderIds.length)
                        await tx.couponUsage.updateMany({ where: { orderId: { in: orderIds } }, data: { orderId: null } });
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
        const where = {
            AND: [
                status === "deleted" ? { deletedAt: { not: null } } : (0, visibility_1.productNotDeletedWhere)(),
                ...(status === "active" ? [(0, visibility_1.activeProductWhere)()] : []),
                ...(status === "inactive" ? [{ isActive: false }] : []),
                ...(q ? [{ OR: [{ title: { contains: q } }, { category: { is: { name: { contains: q } } } }] }] : []),
            ],
        };
        const [products, total] = await Promise.all([
            prisma_1.prisma.product.findMany({ where, include: { category: true, _count: { select: { accounts: true, orders: true } } }, orderBy: { createdAt: "desc" }, skip, take }),
            prisma_1.prisma.product.count({ where }),
        ]);
        const productIds = products.map((product) => product.id);
        if (!productIds.length)
            return [[], total];
        const now = new Date();
        const productIdWhere = { productId: { in: productIds } };
        const [availableGroups, soldGroups, activeGroups] = await Promise.all([
            prisma_1.prisma.productAccount.groupBy({ by: ["productId"], where: { AND: [productIdWhere, sellableInventoryWhere()] }, _count: { _all: true } }),
            prisma_1.prisma.productAccount.groupBy({ by: ["productId"], where: { AND: [productIdWhere, purchasedInventoryWhere()] }, _count: { _all: true } }),
            prisma_1.prisma.productAccount.groupBy({ by: ["productId"], where: { AND: [productIdWhere, activePurchasedInventoryWhere(undefined, now)] }, _count: { _all: true } }),
        ]);
        const availableCounts = new Map(availableGroups.map((group) => [group.productId, group._count._all]));
        const soldCounts = new Map(soldGroups.map((group) => [group.productId, group._count._all]));
        const activeCounts = new Map(activeGroups.map((group) => [group.productId, group._count._all]));
        return [
            products.map((product) => {
                if (product.mode === "xray_auto") {
                    const available = Math.max((product.stockLimit ?? 0) - product.soldCount, 0);
                    return { ...product, inventoryCount: available, soldCount: product.soldCount, activeCount: 0 };
                }
                return {
                    ...product,
                    inventoryCount: availableCounts.get(product.id) ?? 0,
                    soldCount: soldCounts.get(product.id) ?? 0,
                    activeCount: activeCounts.get(product.id) ?? 0,
                };
            }),
            total,
        ];
    }
    static async productDetail(productId) {
        const now = new Date();
        const [product, available, reserved, sold, disabled, expired, activeAccounts, soldAccounts, orderCount, activeCount, revenue] = await Promise.all([
            prisma_1.prisma.product.findUnique({ where: { id: productId }, include: { category: true, _count: { select: { accounts: true, orders: true } } } }),
            prisma_1.prisma.productAccount.count({ where: sellableInventoryWhere(productId) }),
            prisma_1.prisma.productAccount.count({ where: { productId, status: "reserved" } }),
            prisma_1.prisma.productAccount.count({ where: purchasedInventoryWhere(productId) }),
            prisma_1.prisma.productAccount.count({ where: { productId, status: "disabled" } }),
            prisma_1.prisma.productAccount.count({ where: { productId, status: "expired" } }),
            prisma_1.prisma.productAccount.findMany({ where: { OR: [sellableInventoryWhere(productId), { productId, status: "reserved" }] }, orderBy: { createdAt: "desc" }, take: 5 }),
            prisma_1.prisma.productAccount.findMany({ where: purchasedInventoryWhere(productId), orderBy: { soldAt: "desc" }, take: 5 }),
            prisma_1.prisma.order.count({ where: { productId, status: "completed" } }),
            prisma_1.prisma.productAccount.count({ where: activePurchasedInventoryWhere(productId, now) }),
            prisma_1.prisma.order.aggregate({ where: { productId, status: "completed" }, _sum: { finalPaidAmount: true } }),
        ]);
        if (product?.mode === "xray_auto") {
            const [xrayActive, xrayFailed, xrayExpired] = await Promise.all([
                prisma_1.prisma.xrayClient.count({ where: { productId, status: "active" } }),
                prisma_1.prisma.xrayClient.count({ where: { productId, status: "failed" } }),
                prisma_1.prisma.xrayClient.count({ where: { productId, OR: [{ status: "expired" }, { expiresAt: { lte: now } }] } }),
            ]);
            return { product, available: Math.max((product.stockLimit ?? 0) - product.soldCount, 0), reserved: 0, sold: product.soldCount, disabled: 0, expired: xrayExpired, activeAccounts, soldAccounts, orderCount, activeCount: xrayActive, revenue: revenue._sum.finalPaidAmount ?? 0, xrayFailed };
        }
        return { product, available, reserved, sold, disabled, expired, activeAccounts, soldAccounts, orderCount, activeCount, revenue: revenue._sum.finalPaidAmount ?? 0 };
    }
    static async xrayClientList(page = 1, take = 8, status, productId) {
        const skip = (page - 1) * take;
        const where = { ...(status ? { status } : {}), ...(productId ? { productId } : {}) };
        return Promise.all([
            prisma_1.prisma.xrayClient.findMany({ where, include: { product: true, user: true }, orderBy: { createdAt: "desc" }, skip, take }),
            prisma_1.prisma.xrayClient.count({ where }),
        ]);
    }
    static async refreshXrayClient(clientId) {
        const client = await prisma_1.prisma.xrayClient.findUniqueOrThrow({ where: { id: clientId } });
        const panel = await xray_service_1.XrayClientService.getClient(client.clientEmail);
        return { client, panel: panel.obj };
    }
    static async searchProducts(query) {
        return prisma_1.prisma.product.findMany({ where: { AND: [(0, visibility_1.productNotDeletedWhere)()], OR: [{ title: { contains: query } }, { category: { is: { name: { contains: query } } } }] }, include: { category: true }, orderBy: { createdAt: "desc" }, take: 10 });
    }
    static async updateProduct(productId, data, actorId) {
        const { trafficGB, durationDays, duration, ...rest } = data;
        const updateData = cleanUndefined({
            ...rest,
            ...(duration !== undefined ? { duration } : {}),
            ...(trafficGB !== undefined ? { trafficBytes: (0, xray_service_1.gbToBytes)(trafficGB) } : {}),
            ...(durationDays !== undefined ? { durationDays, duration: durationDays } : {}),
        });
        const currentProduct = await prisma_1.prisma.product.findUniqueOrThrow({ where: { id: productId }, select: { mode: true, soldCount: true, categoryId: true } });
        if (currentProduct.mode === "xray_auto") {
            if (trafficGB !== undefined && trafficGB <= 0)
                throw new Error("❌ حجم محصول Xray باید بیشتر از صفر باشد.");
            if (durationDays !== undefined && durationDays <= 0)
                throw new Error("❌ مدت محصول Xray باید بیشتر از صفر باشد.");
            if (updateData.trafficBytes !== undefined && BigInt(updateData.trafficBytes) <= 0n)
                throw new Error("❌ حجم محصول Xray باید بیشتر از صفر باشد.");
            if (updateData.stockLimit !== undefined) {
                if (Number(updateData.stockLimit) < 0)
                    throw new Error("❌ موجودی محصول Xray باید صفر یا بیشتر باشد.");
                if (Number(updateData.stockLimit) < currentProduct.soldCount)
                    throw new Error("❌ موجودی کل نمی‌تواند کمتر از تعداد فروش رفته باشد.");
            }
            if (updateData.xrayLimitIp !== undefined && Number(updateData.xrayLimitIp) < 0)
                throw new Error("❌ محدودیت IP باید صفر یا بیشتر باشد.");
            if (updateData.inboundIds !== undefined && !updateData.inboundIds.length)
                throw new Error("❌ حداقل یک اینباند لازم است");
        }
        if (updateData.categoryId) {
            await prisma_1.prisma.category.findFirstOrThrow({ where: { id: updateData.categoryId, AND: [(0, visibility_1.activeCategoryWhere)()] } });
        }
        if (updateData.isActive) {
            const categoryId = updateData.categoryId ?? currentProduct.categoryId;
            await prisma_1.prisma.category.findFirstOrThrow({ where: { id: categoryId, AND: [(0, visibility_1.activeCategoryWhere)()] } });
            updateData.deletedAt = null;
        }
        const product = await prisma_1.prisma.product.update({ where: { id: productId }, data: updateData });
        await this.audit(actorId, "product.update", { productId, data: updateData });
        return product;
    }
    static async setProductActive(productId, isActive, actorId) {
        if (isActive) {
            const current = await prisma_1.prisma.product.findUniqueOrThrow({ where: { id: productId }, select: { categoryId: true } });
            await prisma_1.prisma.category.findFirstOrThrow({ where: { id: current.categoryId, AND: [(0, visibility_1.activeCategoryWhere)()] } });
        }
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
        const product = await prisma_1.prisma.product.create({ data: { categoryId: source.categoryId, title: `${source.title} - کپی`, price: source.price, duration: source.duration, mode: source.mode, durationDays: source.mode === "xray_auto" ? source.durationDays : undefined, trafficBytes: source.mode === "xray_auto" ? source.trafficBytes : undefined, stockLimit: source.mode === "xray_auto" ? source.stockLimit : undefined, xrayLimitIp: source.mode === "xray_auto" ? source.xrayLimitIp : 0, xrayGroupName: source.mode === "xray_auto" ? source.xrayGroupName : null, inboundIds: source.mode === "xray_auto" ? source.inboundIds : [], inboundSnapshot: source.mode === "xray_auto" ? source.inboundSnapshot : undefined, soldCount: 0, isActive: false, deletedAt: null } });
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
    static async listAccounts(page = 1, take = 8, query, status, productId) {
        const skip = (page - 1) * take;
        const q = containsQuery(query);
        const queryWhere = q ? { OR: [{ username: { contains: q } }, { subscriptionLink: { contains: q } }, { configLink: { contains: q } }, { product: { is: { title: { contains: q } } } }] } : {};
        const productWhere = productId ? { productId } : {};
        const statusWhere = status === "available" ? sellableInventoryWhere(productId) : status === "sold" ? purchasedInventoryWhere(productId) : status ? { ...productWhere, status } : productWhere;
        const where = { AND: [statusWhere, queryWhere] };
        const include = { product: true, items: { where: { order: { is: { status: "completed" } } }, include: { order: { include: { user: true } } }, orderBy: { purchaseDate: "desc" }, take: 1 } };
        const [accounts, total] = await Promise.all([
            prisma_1.prisma.productAccount.findMany({ where, include, orderBy: [{ soldAt: "desc" }, { createdAt: "desc" }], skip, take }),
            prisma_1.prisma.productAccount.count({ where }),
        ]);
        const assignedUserIds = [...new Set(accounts.map((account) => account.items[0]?.order.userId ?? account.soldTo ?? account.reservedBy).filter((id) => Boolean(id)))];
        const users = assignedUserIds.length
            ? await prisma_1.prisma.user.findMany({ where: { id: { in: assignedUserIds } }, select: { id: true, telegramId: true, username: true, firstName: true } })
            : [];
        const userMap = new Map(users.map((user) => [user.id, user]));
        const now = new Date();
        return [accounts.map((account) => {
                const purchase = account.items[0];
                const assignedUserId = purchase?.order.userId ?? account.soldTo ?? account.reservedBy ?? "";
                const effectiveStatus = normalizePurchasedStatus(account, now);
                return { ...account, status: effectiveStatus, assignedUser: userMap.get(assignedUserId) ?? purchase?.order.user ?? null, assignedDate: purchase?.purchaseDate ?? account.soldAt ?? account.reservedAt ?? null };
            }), total];
    }
    static async accountDetail(accountId) {
        const account = await prisma_1.prisma.productAccount.findUnique({ where: { id: accountId }, include: { product: true, items: { where: { order: { is: { status: "completed" } } }, include: { order: { include: { user: true } }, product: true }, orderBy: { purchaseDate: "desc" }, take: 1 }, history: { orderBy: { createdAt: "desc" }, take: 10 } } });
        const purchase = account?.items[0];
        const assignedUserId = purchase?.order.userId ?? account?.soldTo ?? account?.reservedBy;
        const assignedUser = assignedUserId ? await prisma_1.prisma.user.findUnique({ where: { id: assignedUserId }, select: { id: true, telegramId: true, username: true, firstName: true } }) : null;
        return account ? { ...account, status: normalizePurchasedStatus(account), assignedUser: assignedUser ?? purchase?.order.user ?? null, assignedDate: purchase?.purchaseDate ?? account.soldAt ?? account.reservedAt ?? null } : null;
    }
    static async updateAccount(accountId, data, actorId) {
        return prisma_1.prisma.$transaction(async (tx) => {
            const current = await tx.productAccount.findUniqueOrThrow({ where: { id: accountId } });
            if (data.productId && data.productId !== current.productId)
                await tx.product.findFirstOrThrow({ where: { id: data.productId, AND: [(0, visibility_1.productNotDeletedWhere)()] } });
            const update = { ...data, ...(data.configLink ? { config: data.configLink } : {}) };
            const account = await tx.productAccount.update({ where: { id: accountId }, data: update });
            if (data.productId && data.productId !== current.productId)
                await tx.productAccountHistory.create({ data: { accountId, actorId, action: "account.move", fromValue: current.productId, toValue: data.productId } });
            else
                await tx.productAccountHistory.create({ data: { accountId, actorId, action: "account.update", metadata: JSON.stringify(data) } });
            return account;
        });
    }
    static async moveAccount(accountId, productId, actorId) {
        return this.updateAccount(accountId, { productId }, actorId);
    }
    static async setAccountStatus(accountId, status, actorId) {
        const account = await prisma_1.prisma.$transaction(async (tx) => {
            const current = await tx.productAccount.findUniqueOrThrow({ where: { id: accountId } });
            const updated = await tx.productAccount.update({
                where: { id: accountId },
                data: {
                    status,
                    ...(status === "available" ? { reservedBy: null, reservedAt: null, soldTo: null, soldAt: null } : {}),
                    ...(status === "sold" ? { reservedBy: null, reservedAt: null, soldAt: current.soldAt ?? new Date() } : {}),
                },
            });
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
        const [wallet, usage] = await Promise.all([deposit_service_1.CryptoWalletService.get(walletId), deposit_service_1.CryptoWalletService.getUsage(walletId)]);
        return { wallet, pendingDeposits: usage.pendingDeposits, submittedDeposits: usage.submittedDeposits, activePayments: usage.activePayments, deposits: usage.deposits };
    }
    static async saveCryptoWallet(data, actorId, walletId) {
        const wallet = walletId ? await deposit_service_1.CryptoWalletService.update(walletId, data, actorId) : await deposit_service_1.CryptoWalletService.create(data, actorId);
        this.invalidateDashboardCache();
        return wallet;
    }
    static async setCryptoWalletStatus(walletId, status, actorId) {
        const wallet = status === "active" ? await deposit_service_1.CryptoWalletService.enable(walletId, actorId) : await deposit_service_1.CryptoWalletService.disable(walletId, actorId);
        this.invalidateDashboardCache();
        return wallet;
    }
    static async deleteCryptoWallet(walletId, actorId) {
        const wallet = await deposit_service_1.CryptoWalletService.delete(walletId, actorId);
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
    static async accountStats(productId) {
        const where = productId ? { productId } : {};
        const [total, available, reserved, sold, disabled, expired, products] = await Promise.all([
            prisma_1.prisma.productAccount.count({ where }),
            prisma_1.prisma.productAccount.count({ where: sellableInventoryWhere(productId) }),
            prisma_1.prisma.productAccount.count({ where: { ...where, status: "reserved" } }),
            prisma_1.prisma.productAccount.count({ where: purchasedInventoryWhere(productId) }),
            prisma_1.prisma.productAccount.count({ where: { ...where, status: "disabled" } }),
            prisma_1.prisma.productAccount.count({ where: { ...where, status: "expired" } }),
            prisma_1.prisma.product.findMany({
                where: (0, visibility_1.productNotDeletedWhere)(),
                include: { _count: { select: { accounts: true } } },
                orderBy: [{ isActive: "desc" }, { title: "asc" }],
                take: 50,
            }),
        ]);
        return { total, available, reserved, sold, disabled, expired, products };
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
