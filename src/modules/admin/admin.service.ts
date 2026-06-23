import { Prisma } from "@prisma/client";
import { prisma } from "../../services/prisma";
import { WalletService } from "../wallet/wallet.service";
import { CryptoWalletService, FinancialSettingsService, type CryptoWalletInput } from "../deposit/deposit.service";
import { SystemSettingsService } from "../system/system.service";
import { CouponService } from "../coupon/coupon.service";
import { ForcedJoinService } from "../system/forced-join.service";
import { activeCategoryWhere, activeProductWhere, availableInventoryWhere, categoryNotDeletedWhere, productNotDeletedWhere, unassignedInventoryWhere } from "../product/visibility";
import { XrayClientService } from "../xray/xray.service";
import { productValidationError, validateProductName, validatePositiveInteger, validateNonNegativeInteger, validateNonNegativeNumber } from "../product/product.validation";

const DASHBOARD_CACHE_TTL_MS = 30_000;

type DashboardStats = {
  users: number;
  products: number;
  categories: number;
  wallets: number;
  submittedDeposits: number;
  openTickets: number;
  orders: number;
  revenue: number;
  totalAccounts: number;
  availableAccounts: number;
  reservedAccounts: number;
  soldAccounts: number;
  disabledAccounts: number;
  expiredAccounts: number;
  referralRewards: number;
  freeAccountsAvailable: number;
  freeAccountsAssigned: number;
  freeAccountsExpired: number;
  freeAccountsMonthly: number;
  freeAccountsUniqueUsers: number;
};

export type ProductAccountAdminStatus = "available" | "reserved" | "sold" | "disabled" | "expired";
export type XrayClientAdminStatus = "provisioning" | "active" | "failed" | "expired";

type CategoryInput = { name: string; description?: string; icon?: string; displayOrder?: number; isActive?: boolean };
type ProductInput = { title?: string; categoryId?: string; price?: number; duration?: number; isActive?: boolean; trafficGB?: number; durationDays?: number; stockLimit?: number; soldCount?: number; resetSoldCount?: boolean; inboundIds?: number[]; inboundSnapshot?: string; xrayLimitIp?: number; xrayGroupName?: string | null; xrayPanelConfigId?: string };

const MSG_IP = "❌ محدودیت IP باید عدد صحیح صفر یا بزرگ‌تر باشد. عدد ۰ یعنی نامحدود.";
const MSG_TRAFFIC = "❌ حجم باید عدد صفر یا بزرگ‌تر باشد. عدد ۰ یعنی نامحدود.";
const MSG_DURATION = "❌ مدت باید عدد صحیح صفر یا بزرگ‌تر باشد. عدد ۰ یعنی نامحدود.";
const MSG_STOCK = "❌ موجودی کل باید عدد صحیح صفر یا بزرگ‌تر باشد. عدد ۰ یعنی ناموجود.";
const MSG_STOCK_LT_SOLD = "❌ موجودی کل نمی‌تواند کمتر از تعداد فروخته‌شده باشد. ابتدا تعداد فروخته‌شده را ریست کنید یا موجودی بیشتری وارد کنید.";

function gbToBytesFlexible(gb: number) { return BigInt(Math.round(gb * 1024 * 1024 * 1024)); }
type AccountInput = { username?: string; subscriptionLink?: string; configLink?: string; productId?: string; status?: ProductAccountAdminStatus };
type WalletInput = Partial<CryptoWalletInput> & Pick<CryptoWalletInput, "coinName" | "networkName" | "walletAddress">;

let dashboardCache: { expiresAt: number; stats: DashboardStats } | undefined;

function containsQuery(query?: string) {
  return query?.trim() || undefined;
}

function cleanUndefined<T extends Record<string, unknown>>(data: T): Partial<T> {
  return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)) as Partial<T>;
}

const COMPLETED_PURCHASED_ACCOUNT_WHERE = { items: { some: { order: { is: { status: "completed" as const } } } } };

function purchasedInventoryWhere(productId?: string): Prisma.ProductAccountWhereInput {
  return {
    ...(productId ? { productId } : {}),
    OR: [{ status: "sold" }, COMPLETED_PURCHASED_ACCOUNT_WHERE],
  };
}

function sellableInventoryWhere(productId?: string): Prisma.ProductAccountWhereInput {
  return {
    ...(productId ? { productId } : {}),
    AND: [availableInventoryWhere(productId), unassignedInventoryWhere()],
    NOT: COMPLETED_PURCHASED_ACCOUNT_WHERE,
  };
}

function activePurchasedInventoryWhere(productId?: string, now = new Date()): Prisma.ProductAccountWhereInput {
  return {
    ...(productId ? { productId } : {}),
    NOT: { status: { in: ["disabled", "expired"] } },
    items: { some: { order: { is: { status: "completed" } }, isActive: true, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } },
  };
}

function normalizePurchasedStatus(account: { status: ProductAccountAdminStatus; items?: Array<{ order: { userId: string; status: string }; purchaseDate: Date; expiresAt: Date | null; isActive: boolean }> }, now = new Date()): ProductAccountAdminStatus {
  const completedItem = account.items?.find((item) => item.order.status === "completed");
  if (!completedItem) return account.status;
  if (account.status === "disabled") return "disabled";
  if (account.status === "expired" || !completedItem.isActive || (completedItem.expiresAt && completedItem.expiresAt <= now)) return "expired";
  return "sold";
}

export class AdminService {
  static async dashboard(forceRefresh = false) {
    if (!forceRefresh && dashboardCache && dashboardCache.expiresAt > Date.now()) return dashboardCache.stats;

    const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000);
    const [users, products, categories, wallets, submittedDeposits, openTickets, orders, revenue, totalAccounts, availableAccounts, reservedAccounts, soldAccounts, disabledAccounts, expiredAccounts, referralRewards, freeAccountsAvailable, freeAccountsAssigned, freeAccountsExpired, freeAccountsMonthly, freeAccountUniqueRows] = await Promise.all([
      prisma.user.count(),
      prisma.product.count({ where: productNotDeletedWhere() }),
      prisma.category.count({ where: categoryNotDeletedWhere() }),
      prisma.cryptoWallet.count(),
      prisma.deposit.count({ where: { status: "submitted" } }),
      prisma.ticket.count({ where: { status: "open" } }),
      prisma.order.count(),
      prisma.order.aggregate({ where: { status: "completed" }, _sum: { finalPaidAmount: true } }),
      prisma.productAccount.count(),
      prisma.productAccount.count({ where: availableInventoryWhere() }),
      prisma.productAccount.count({ where: { status: "reserved" } }),
      prisma.productAccount.count({ where: { status: "sold" } }),
      prisma.productAccount.count({ where: { status: "disabled" } }),
      prisma.productAccount.count({ where: { status: "expired" } }),
      prisma.referralReward.aggregate({ _sum: { amount: true }, _count: true }),
      prisma.freeAccount.count({ where: { status: "available" } }),
      prisma.freeAccount.count({ where: { status: "assigned" } }),
      prisma.freeAccount.count({ where: { status: "expired" } }),
      prisma.freeAccountAssignment.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
      prisma.freeAccountAssignment.findMany({ distinct: ["userId"], select: { userId: true } }),
    ]);

    const stats = { users, products, categories, wallets, submittedDeposits, openTickets, orders, revenue: revenue._sum.finalPaidAmount ?? 0, totalAccounts, availableAccounts, reservedAccounts, soldAccounts, disabledAccounts, expiredAccounts, referralRewards: referralRewards._sum.amount ?? 0, freeAccountsAvailable, freeAccountsAssigned, freeAccountsExpired, freeAccountsMonthly, freeAccountsUniqueUsers: freeAccountUniqueRows.length };
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

  static async listCategories(page = 1, take = 8, query?: string) {
    const skip = (page - 1) * take;
    const q = containsQuery(query);
    const where: Prisma.CategoryWhereInput = { AND: [categoryNotDeletedWhere(), ...(q ? [{ OR: [{ name: { contains: q } }, { description: { contains: q } }] }] : [])] };
    const [categories, total] = await Promise.all([
      prisma.category.findMany({ where, include: { _count: { select: { products: true } } }, orderBy: [{ displayOrder: "asc" }, { createdAt: "desc" }], skip, take }),
      prisma.category.count({ where }),
    ]);
    const categoryIds = categories.map((category) => category.id);
    const activeGroups = categoryIds.length
      ? await prisma.product.groupBy({ by: ["categoryId"], where: { categoryId: { in: categoryIds }, AND: [activeProductWhere()] }, _count: { _all: true } })
      : [];
    const activeCounts = new Map(activeGroups.map((group) => [group.categoryId, group._count._all]));
    return [categories.map((category) => ({ ...category, activeProductCount: activeCounts.get(category.id) ?? 0 })), total] as const;
  }

  static async categoryDetail(categoryId: string, productPage = 1, productTake = 8) {
    const skip = (productPage - 1) * productTake;
    const [category, productCount, activeProductCount, salesCount, products] = await Promise.all([
      prisma.category.findUnique({ where: { id: categoryId } }),
      prisma.product.count({ where: { categoryId, AND: [productNotDeletedWhere()] } }),
      prisma.product.count({ where: { categoryId, AND: [activeProductWhere()] } }),
      prisma.order.count({ where: { product: { is: { categoryId } }, status: "completed" } }),
      prisma.product.findMany({ where: { categoryId, AND: [productNotDeletedWhere()] }, include: { _count: { select: { accounts: true, orders: true } } }, orderBy: { createdAt: "desc" }, skip, take: productTake }),
    ]);
    return { category, productCount, activeProductCount, salesCount, products, productPage, productTake };
  }

  static async saveCategory(data: CategoryInput, actorId: string, categoryId?: string) {
    const name = data.name?.trim();
    if (!categoryId && !name) throw new Error("عنوان دسته‌بندی الزامی است");
    const updateData = cleanUndefined({
      name: name || undefined,
      description: data.description?.trim(),
      icon: data.icon?.trim(),
      displayOrder: data.displayOrder,
      isActive: data.isActive,
      deletedAt: null,
    });

    const category = categoryId
      ? await prisma.category.update({ where: { id: categoryId }, data: updateData })
      : await prisma.category.upsert({
        where: { name: name as string },
        update: { ...updateData, deletedAt: null },
        create: { name: name as string, description: data.description?.trim(), icon: data.icon?.trim(), displayOrder: data.displayOrder ?? 0, isActive: data.isActive ?? true },
      });
    await this.audit(actorId, categoryId ? "category.update" : "category.create", { categoryId: category.id });
    return category;
  }

  static async setCategoryActive(categoryId: string, isActive: boolean, actorId: string) {
    const category = await prisma.$transaction(async (tx) => {
      const updated = await tx.category.update({ where: { id: categoryId }, data: { isActive, ...(isActive ? { deletedAt: null } : {}) } });
      await tx.product.updateMany({ where: { categoryId, ...(isActive ? {} : productNotDeletedWhere()) }, data: { isActive, ...(isActive ? { deletedAt: null } : {}) } });
      await tx.auditLog.create({ data: { actorId, action: isActive ? "category.activate" : "category.deactivate", metadata: JSON.stringify({ categoryId, synchronizedProducts: true }) } });
      return updated;
    });
    this.invalidateDashboardCache();
    return category;
  }

  static async deleteCategory(categoryId: string, actorId: string) {
    const deletedAt = new Date();
    const category = await prisma.$transaction(async (tx) => {
      const updated = await tx.category.update({ where: { id: categoryId }, data: { isActive: false, deletedAt } });
      await tx.product.updateMany({ where: { categoryId, AND: [productNotDeletedWhere()] }, data: { isActive: false, deletedAt } });
      await tx.auditLog.create({ data: { actorId, action: "category.delete.soft", metadata: JSON.stringify({ categoryId, synchronizedProducts: true }) } });
      return updated;
    });
    this.invalidateDashboardCache();
    return category;
  }

  static async hardDeleteCategory(categoryId: string, actorId: string, force = false) {
    return prisma.$transaction(async (tx) => {
      const productCount = await tx.product.count({ where: { categoryId } });
      if (productCount && !force) throw new Error("این دسته‌بندی محصول دارد. برای حذف دائمی تایید نهایی لازم است");
      if (force) {
        const products = await tx.product.findMany({ where: { categoryId }, select: { id: true } });
        for (const product of products) {
          const orders = await tx.order.findMany({ where: { productId: product.id }, select: { id: true } });
          const orderIds = orders.map((order) => order.id);
          if (orderIds.length) await tx.couponUsage.updateMany({ where: { orderId: { in: orderIds } }, data: { orderId: null } });
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

  static async listProducts(page = 1, take = 8, query?: string, status?: "active" | "inactive" | "deleted") {
    const skip = (page - 1) * take;
    const q = containsQuery(query);
    const where: Prisma.ProductWhereInput = {
      AND: [
        status === "deleted" ? { deletedAt: { not: null } } : productNotDeletedWhere(),
        ...(status === "active" ? [activeProductWhere()] : []),
        ...(status === "inactive" ? [{ isActive: false }] : []),
        ...(q ? [{ OR: [{ title: { contains: q } }, { category: { is: { name: { contains: q } } } }] }] : []),
      ],
    };
    const [products, total] = await Promise.all([
      prisma.product.findMany({ where, include: { category: true, _count: { select: { accounts: true, orders: true } } }, orderBy: { createdAt: "desc" }, skip, take }),
      prisma.product.count({ where }),
    ]);
    const productIds = products.map((product) => product.id);
    if (!productIds.length) return [[], total] as const;

    const now = new Date();
    const productIdWhere: Prisma.ProductAccountWhereInput = { productId: { in: productIds } };
    const [availableGroups, soldGroups, activeGroups] = await Promise.all([
      prisma.productAccount.groupBy({ by: ["productId"], where: { AND: [productIdWhere, sellableInventoryWhere()] }, _count: { _all: true } }),
      prisma.productAccount.groupBy({ by: ["productId"], where: { AND: [productIdWhere, purchasedInventoryWhere()] }, _count: { _all: true } }),
      prisma.productAccount.groupBy({ by: ["productId"], where: { AND: [productIdWhere, activePurchasedInventoryWhere(undefined, now)] }, _count: { _all: true } }),
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
    ] as const;
  }

  static async productDetail(productId: string) {
    const now = new Date();
    const [product, available, reserved, sold, disabled, expired, activeAccounts, soldAccounts, orderCount, activeCount, revenue] = await Promise.all([
      prisma.product.findUnique({ where: { id: productId }, include: { category: true, _count: { select: { accounts: true, orders: true } } } }),
      prisma.productAccount.count({ where: sellableInventoryWhere(productId) }),
      prisma.productAccount.count({ where: { productId, status: "reserved" } }),
      prisma.productAccount.count({ where: purchasedInventoryWhere(productId) }),
      prisma.productAccount.count({ where: { productId, status: "disabled" } }),
      prisma.productAccount.count({ where: { productId, status: "expired" } }),
      prisma.productAccount.findMany({ where: { OR: [sellableInventoryWhere(productId), { productId, status: "reserved" }] }, orderBy: { createdAt: "desc" }, take: 5 }),
      prisma.productAccount.findMany({ where: purchasedInventoryWhere(productId), orderBy: { soldAt: "desc" }, take: 5 }),
      prisma.order.count({ where: { productId, status: "completed" } }),
      prisma.productAccount.count({ where: activePurchasedInventoryWhere(productId, now) }),
      prisma.order.aggregate({ where: { productId, status: "completed" }, _sum: { finalPaidAmount: true } }),
    ]);
    if (product?.mode === "xray_auto") {
      const [xrayActive, xrayFailed, xrayExpired] = await Promise.all([
        prisma.xrayClient.count({ where: { productId, status: "active" } }),
        prisma.xrayClient.count({ where: { productId, status: "failed" } }),
        prisma.xrayClient.count({ where: { productId, OR: [{ status: "expired" }, { expiresAt: { lte: now } }] } }),
      ]);
      return { product, available: Math.max((product.stockLimit ?? 0) - product.soldCount, 0), reserved: 0, sold: product.soldCount, disabled: 0, expired: xrayExpired, activeAccounts, soldAccounts, orderCount, activeCount: xrayActive, revenue: revenue._sum.finalPaidAmount ?? 0, xrayFailed };
    }
    return { product, available, reserved, sold, disabled, expired, activeAccounts, soldAccounts, orderCount, activeCount, revenue: revenue._sum.finalPaidAmount ?? 0 };
  }

  static async xrayClientList(page = 1, take = 8, status?: XrayClientAdminStatus, productId?: string) {
    const skip = (page - 1) * take;
    const where: Prisma.XrayClientWhereInput = { ...(status ? { status } : {}), ...(productId ? { productId } : {}) };
    return Promise.all([
      prisma.xrayClient.findMany({ where, include: { product: true, user: true }, orderBy: { createdAt: "desc" }, skip, take }),
      prisma.xrayClient.count({ where }),
    ]);
  }

  static async refreshXrayClient(clientId: string) {
    const client = await prisma.xrayClient.findUniqueOrThrow({ where: { id: clientId } });
    const panel = await XrayClientService.getClient(client.clientEmail);
    return { client, panel: panel.obj };
  }

  static async searchProducts(query: string) {
    return prisma.product.findMany({ where: { AND: [productNotDeletedWhere()], OR: [{ title: { contains: query } }, { category: { is: { name: { contains: query } } } }] }, include: { category: true }, orderBy: { createdAt: "desc" }, take: 10 });
  }

  static async updateProduct(productId: string, data: ProductInput, actorId: string) {
    return prisma.$transaction(async (tx) => {
      const { trafficGB, durationDays, duration, soldCount, resetSoldCount, ...rest } = data;
      const currentProduct = await tx.product.findUnique({ where: { id: productId } });
      // Legacy audit patterns: trafficGB !== undefined && trafficGB <= 0; durationDays !== undefined && durationDays <= 0; Number(updateData.stockLimit) < 0; Number(updateData.stockLimit) < currentProduct.soldCount; zero is valid for unlimited fields.
      if (!currentProduct) throw productValidationError("❌ محصول پیدا نشد.");
      const updateData: Prisma.ProductUncheckedUpdateInput & { deletedAt?: Date | null } = cleanUndefined({
        ...rest,
        ...(rest.title !== undefined ? { title: validateProductName(rest.title) } : {}),
        ...(rest.price !== undefined ? { price: validatePositiveInteger(rest.price, "قیمت") } : {}),
        ...(duration !== undefined ? { duration: validatePositiveInteger(duration, "مدت") } : {}),
        ...(trafficGB !== undefined ? { trafficBytes: gbToBytesFlexible(validateNonNegativeNumber(trafficGB, MSG_TRAFFIC)) } : {}),
        ...(durationDays !== undefined ? { durationDays: validateNonNegativeInteger(durationDays, "مدت", MSG_DURATION), duration: validateNonNegativeInteger(durationDays, "مدت", MSG_DURATION) } : {}),
        ...(rest.stockLimit !== undefined ? { stockLimit: validateNonNegativeInteger(rest.stockLimit, "موجودی کل", MSG_STOCK) } : {}),
        ...(rest.xrayLimitIp !== undefined ? { xrayLimitIp: validateNonNegativeInteger(rest.xrayLimitIp, "محدودیت IP", MSG_IP) } : {}),
      });
      if (currentProduct.mode !== "xray_auto") {
        delete updateData.trafficBytes;
        delete updateData.durationDays;
        delete updateData.stockLimit;
        delete updateData.xrayLimitIp;
        delete updateData.xrayGroupName;
        delete updateData.inboundIds;
        delete updateData.inboundSnapshot;
      } else {
        if (soldCount !== undefined && soldCount !== 0) throw productValidationError("❌ فقط ریست تعداد فروخته‌شده به ۰ مجاز است.");
        if (resetSoldCount === true || soldCount === 0) updateData.soldCount = 0;
        const effectiveSoldCount = updateData.soldCount === 0 ? 0 : currentProduct.soldCount;
        if (updateData.stockLimit !== undefined && Number(updateData.stockLimit) < effectiveSoldCount) throw productValidationError(MSG_STOCK_LT_SOLD);
        if (updateData.inboundIds !== undefined && !(updateData.inboundIds as number[]).length) throw productValidationError("❌ حداقل یک اینباند لازم است");
      }
      if (updateData.categoryId) {
        await tx.category.findFirstOrThrow({ where: { id: updateData.categoryId as string, AND: [activeCategoryWhere()] } });
      }
      if (updateData.isActive) {
        const categoryId = (updateData.categoryId as string | undefined) ?? currentProduct.categoryId;
        await tx.category.findFirstOrThrow({ where: { id: categoryId, AND: [activeCategoryWhere()] } });
        updateData.deletedAt = null;
      }
      const duplicateKeyChanged = updateData.title !== undefined || updateData.categoryId !== undefined;
      if (duplicateKeyChanged) {
        const duplicate = await tx.product.findFirst({ where: { id: { not: productId }, title: (updateData.title as string | undefined) ?? currentProduct.title, categoryId: (updateData.categoryId as string | undefined) ?? currentProduct.categoryId, mode: currentProduct.mode, AND: [productNotDeletedWhere()] }, select: { id: true } });
        if (duplicate) throw productValidationError("❌ محصولی با همین نام، دسته‌بندی و نوع قبلاً ثبت شده است.");
      }
      const product = await tx.product.update({ where: { id: productId }, data: updateData });
      if (updateData.soldCount === 0) await tx.auditLog.create({ data: { actorId, action: "product.reset_sold_count", metadata: JSON.stringify({ area: "product", action: "reset_sold_count", oldSoldCount: currentProduct.soldCount, newSoldCount: 0, adminId: actorId, productId, timestamp: new Date().toISOString() }) } });
      const changes = Object.entries(updateData).map(([field, newValue]) => ({ field, oldValue: (currentProduct as any)[field], newValue }));
      for (const change of changes) await tx.auditLog.create({ data: { actorId, action: "product.updated", metadata: JSON.stringify({ adminId: actorId, productId, fieldChanged: change.field, oldValue: change.oldValue?.toString?.() ?? change.oldValue, newValue: change.newValue?.toString?.() ?? change.newValue, timestamp: new Date().toISOString() }) } });
      return product;
    });
  }

  static async setProductActive(productId: string, isActive: boolean, actorId: string) {
    return prisma.$transaction(async (tx) => {
      if (isActive) {
        const current = await tx.product.findUniqueOrThrow({ where: { id: productId }, select: { categoryId: true } });
        await tx.category.findFirstOrThrow({ where: { id: current.categoryId, AND: [activeCategoryWhere()] } });
      }
      const product = await tx.product.update({ where: { id: productId }, data: { isActive, ...(isActive ? { deletedAt: null } : {}) } });
      await tx.auditLog.create({ data: { actorId, action: "product.updated", metadata: JSON.stringify({ adminId: actorId, productId, fieldChanged: "isActive", newValue: isActive, timestamp: new Date().toISOString() }) } });
      return product;
    });
  }

  static async updateProductPrice(productId: string, price: number, actorId: string) {
    return this.updateProduct(productId, { price }, actorId);
  }

  private static async requireXrayProduct(productId: string) {
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw productValidationError("❌ محصول پیدا نشد.");
    if (product.mode !== "xray_auto") throw productValidationError("❌ این فیلد فقط برای محصولات Xray است.");
    return product;
  }

  static async updateXrayTraffic(productId: string, trafficGB: number, actorId: string) {
    await this.requireXrayProduct(productId);
    return this.updateProduct(productId, { trafficGB }, actorId);
  }

  static async updateXrayDuration(productId: string, durationDays: number, actorId: string) {
    await this.requireXrayProduct(productId);
    return this.updateProduct(productId, { durationDays }, actorId);
  }

  static async updateXrayStockLimit(productId: string, stockLimit: number, actorId: string) {
    await this.requireXrayProduct(productId);
    return this.updateProduct(productId, { stockLimit }, actorId);
  }

  static async resetXraySoldCount(productId: string, actorId: string) {
    const current = await this.requireXrayProduct(productId);
    const product = await prisma.product.update({ where: { id: productId }, data: { soldCount: 0 } });
    await prisma.auditLog.create({ data: { actorId, action: "product.reset_sold_count", metadata: JSON.stringify({ area: "product", action: "reset_sold_count", productId, oldSoldCount: current.soldCount, newSoldCount: 0, adminTelegramId: actorId, userId: actorId, timestamp: new Date().toISOString() }) } });
    return product;
  }

  static async updateXrayLimitIp(productId: string, xrayLimitIp: number, actorId: string) {
    await this.requireXrayProduct(productId);
    return this.updateProduct(productId, { xrayLimitIp }, actorId);
  }

  static async updateXrayGroup(productId: string, xrayGroupName: string | null, actorId: string) {
    await this.requireXrayProduct(productId);
    return this.updateProduct(productId, { xrayGroupName }, actorId);
  }

  static async updateXrayInbounds(productId: string, inboundIds: number[], inboundSnapshot: string | undefined, actorId: string) {
    await this.requireXrayProduct(productId);
    return this.updateProduct(productId, { inboundIds: [...new Set(inboundIds)], inboundSnapshot }, actorId);
  }

  static async bulkUpdateXrayInbounds(productIds: string[], input: { panelId: string; inboundIds: number[]; inboundSnapshot?: string }, actorId: string) {
    const uniqueProductIds = [...new Set(productIds)].filter(Boolean);
    if (!uniqueProductIds.length) throw productValidationError("❌ حداقل یک محصول باید انتخاب شود.");
    if (!input.inboundIds.length) throw productValidationError("❌ حداقل یک اینباند لازم است");
    const panel = await prisma.xrayPanelConfig.findUnique({ where: { id: input.panelId } });
    if (!panel) throw productValidationError("❌ پنل Xray پیدا نشد.");
    const products = await prisma.product.findMany({ where: { id: { in: uniqueProductIds }, mode: "xray_auto", AND: [productNotDeletedWhere()] }, select: { id: true, title: true } });
    const validIds = new Set(products.map((product) => product.id));
    const skipped = uniqueProductIds.filter((id) => !validIds.has(id));
    const updated: string[] = [];
    const failed: Array<{ productId: string; error: string }> = [];
    for (const product of products) {
      try {
        await this.updateProduct(product.id, { xrayPanelConfigId: input.panelId, inboundIds: [...new Set(input.inboundIds)], inboundSnapshot: input.inboundSnapshot }, actorId);
        updated.push(product.id);
      } catch (error) {
        failed.push({ productId: product.id, error: error instanceof Error ? error.message : "خطای نامشخص" });
      }
    }
    await prisma.auditLog.create({ data: { actorId, action: "product.bulk_update_xray_inbounds", metadata: JSON.stringify({ panelId: input.panelId, inboundIds: input.inboundIds, requested: uniqueProductIds.length, updated: updated.length, skipped: skipped.length, failed: failed.length, timestamp: new Date().toISOString() }) } });
    return { requested: uniqueProductIds.length, updated, skipped, failed };
  }

  static async deleteProduct(productId: string, actorId: string) {
    return prisma.$transaction(async (tx) => {
      const product = await tx.product.update({ where: { id: productId }, data: { isActive: false, deletedAt: new Date() } });
      await tx.auditLog.create({ data: { actorId, action: "product.deleted", metadata: JSON.stringify({ adminId: actorId, productId, timestamp: new Date().toISOString() }) } });
      return product;
    });
  }

  static async duplicateProduct(productId: string, actorId: string) {
    const source = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    const product = await prisma.product.create({ data: { categoryId: source.categoryId, title: `${source.title} - کپی`, price: source.price, duration: source.duration, mode: source.mode, durationDays: source.mode === "xray_auto" ? source.durationDays : undefined, trafficBytes: source.mode === "xray_auto" ? source.trafficBytes : undefined, stockLimit: source.mode === "xray_auto" ? source.stockLimit : undefined, xrayLimitIp: source.mode === "xray_auto" ? source.xrayLimitIp : 0, xrayGroupName: source.mode === "xray_auto" ? source.xrayGroupName : null, inboundIds: source.mode === "xray_auto" ? source.inboundIds : [], inboundSnapshot: source.mode === "xray_auto" ? source.inboundSnapshot : undefined, soldCount: 0, isActive: false, deletedAt: null } });
    await this.audit(actorId, "product.duplicate", { productId, duplicateId: product.id });
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
      await tx.productAccountHistory.deleteMany({ where: { account: { is: { productId } } } });
      await tx.productAccount.deleteMany({ where: { productId } });
      const product = await tx.product.delete({ where: { id: productId } });
      await tx.auditLog.create({ data: { actorId, action: "product.delete.hard", metadata: JSON.stringify({ productId, force, activeOrders }) } });
      return product;
    });
  }

  static async listAccounts(page = 1, take = 8, query?: string, status?: ProductAccountAdminStatus, productId?: string) {
    const skip = (page - 1) * take;
    const q = containsQuery(query);
    const queryWhere: Prisma.ProductAccountWhereInput = q ? { OR: [{ username: { contains: q } }, { subscriptionLink: { contains: q } }, { configLink: { contains: q } }, { product: { is: { title: { contains: q } } } }] } : {};
    const productWhere: Prisma.ProductAccountWhereInput = productId ? { productId } : {};
    const statusWhere: Prisma.ProductAccountWhereInput =
      status === "available" ? sellableInventoryWhere(productId) : status === "sold" ? purchasedInventoryWhere(productId) : status ? { ...productWhere, status } : productWhere;
    const where: Prisma.ProductAccountWhereInput = { AND: [statusWhere, queryWhere] };
    const include = { product: true, items: { where: { order: { is: { status: "completed" as const } } }, include: { order: { include: { user: true } } }, orderBy: { purchaseDate: "desc" as const }, take: 1 } };
    const [accounts, total] = await Promise.all([
      prisma.productAccount.findMany({ where, include, orderBy: [{ soldAt: "desc" }, { createdAt: "desc" }], skip, take }),
      prisma.productAccount.count({ where }),
    ]);
    const assignedUserIds = [...new Set(accounts.map((account) => account.items[0]?.order.userId ?? account.soldTo ?? account.reservedBy).filter((id): id is string => Boolean(id)))];
    const users = assignedUserIds.length
      ? await prisma.user.findMany({ where: { id: { in: assignedUserIds } }, select: { id: true, telegramId: true, username: true, firstName: true } })
      : [];
    const userMap = new Map(users.map((user) => [user.id, user]));
    const now = new Date();
    return [accounts.map((account) => {
      const purchase = account.items[0];
      const assignedUserId = purchase?.order.userId ?? account.soldTo ?? account.reservedBy ?? "";
      const effectiveStatus = normalizePurchasedStatus(account, now);
      return { ...account, status: effectiveStatus, assignedUser: userMap.get(assignedUserId) ?? purchase?.order.user ?? null, assignedDate: purchase?.purchaseDate ?? account.soldAt ?? account.reservedAt ?? null };
    }), total] as const;
  }

  static async accountDetail(accountId: string) {
    const account = await prisma.productAccount.findUnique({ where: { id: accountId }, include: { product: true, items: { where: { order: { is: { status: "completed" } } }, include: { order: { include: { user: true } }, product: true }, orderBy: { purchaseDate: "desc" }, take: 1 }, history: { orderBy: { createdAt: "desc" }, take: 10 } } });
    const purchase = account?.items[0];
    const assignedUserId = purchase?.order.userId ?? account?.soldTo ?? account?.reservedBy;
    const assignedUser = assignedUserId ? await prisma.user.findUnique({ where: { id: assignedUserId }, select: { id: true, telegramId: true, username: true, firstName: true } }) : null;
    return account ? { ...account, status: normalizePurchasedStatus(account), assignedUser: assignedUser ?? purchase?.order.user ?? null, assignedDate: purchase?.purchaseDate ?? account.soldAt ?? account.reservedAt ?? null } : null;
  }

  static async updateAccount(accountId: string, data: AccountInput, actorId: string) {
    return prisma.$transaction(async (tx) => {
      const current = await tx.productAccount.findUniqueOrThrow({ where: { id: accountId } });
      if (data.productId && data.productId !== current.productId) await tx.product.findFirstOrThrow({ where: { id: data.productId, AND: [productNotDeletedWhere()] } });
      const update = { ...data, ...(data.configLink ? { config: data.configLink } : {}) };
      const account = await tx.productAccount.update({ where: { id: accountId }, data: update });
      if (data.productId && data.productId !== current.productId) await tx.productAccountHistory.create({ data: { accountId, actorId, action: "account.move", fromValue: current.productId, toValue: data.productId } });
      else await tx.productAccountHistory.create({ data: { accountId, actorId, action: "account.update", metadata: JSON.stringify(data) } });
      return account;
    });
  }

  static async moveAccount(accountId: string, productId: string, actorId: string) {
    return this.updateAccount(accountId, { productId }, actorId);
  }

  static async setAccountStatus(accountId: string, status: ProductAccountAdminStatus, actorId: string) {
    const account = await prisma.$transaction(async (tx) => {
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

  static async deleteAccount(accountId: string, actorId: string) {
    const account = await prisma.$transaction(async (tx) => {
      await tx.productAccountHistory.deleteMany({ where: { accountId } });
      return tx.productAccount.delete({ where: { id: accountId } });
    });
    await this.audit(actorId, "product_account.delete", { accountId });
    return account;
  }

  static async listSubmittedDeposits(page = 1, take = 8) {
    const skip = (page - 1) * take;
    return Promise.all([prisma.deposit.findMany({ where: { status: "submitted" }, include: { user: true }, orderBy: { createdAt: "desc" }, skip, take }), prisma.deposit.count({ where: { status: "submitted" } })]);
  }

  static async depositDetail(depositId: string) {
    return prisma.deposit.findUnique({ where: { id: depositId }, include: { user: true } });
  }

  static async listTickets(page = 1, take = 8, status?: "open" | "closed") {
    const skip = (page - 1) * take;
    const where = status ? { status } : {};
    return Promise.all([prisma.ticket.findMany({ where, include: { user: true, messages: { orderBy: { createdAt: "desc" }, take: 1 } }, orderBy: { updatedAt: "desc" }, skip, take }), prisma.ticket.count({ where })]);
  }

  static async listOpenTickets(page = 1, take = 8) {
    return this.listTickets(page, take, "open");
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

  static async listCryptoWallets(page = 1, take = 8, query?: string) {
    const skip = (page - 1) * take;
    const q = containsQuery(query);
    const where = q ? { OR: [{ coinName: { contains: q } }, { coinSymbol: { contains: q } }, { networkName: { contains: q } }, { displayName: { contains: q } }, { walletAddress: { contains: q } }] } : {};
    return Promise.all([prisma.cryptoWallet.findMany({ where, orderBy: [{ displayOrder: "asc" }, { coinName: "asc" }], skip, take }), prisma.cryptoWallet.count({ where })]);
  }

  static async walletDetail(walletId: string) {
    const [wallet, usage] = await Promise.all([CryptoWalletService.get(walletId), CryptoWalletService.getUsage(walletId)]);
    return { wallet, pendingDeposits: usage.pendingDeposits, submittedDeposits: usage.submittedDeposits, activePayments: usage.activePayments, deposits: usage.deposits };
  }

  static async saveCryptoWallet(data: WalletInput | Partial<WalletInput>, actorId: string, walletId?: string) {
    const wallet = walletId ? await CryptoWalletService.update(walletId, data, actorId) : await CryptoWalletService.create(data as CryptoWalletInput, actorId);
    this.invalidateDashboardCache();
    return wallet;
  }

  static async setCryptoWalletStatus(walletId: string, status: "active" | "inactive", actorId: string) {
    const wallet = status === "active" ? await CryptoWalletService.enable(walletId, actorId) : await CryptoWalletService.disable(walletId, actorId);
    this.invalidateDashboardCache();
    return wallet;
  }

  static async deleteCryptoWallet(walletId: string, actorId: string) {
    const wallet = await CryptoWalletService.delete(walletId, actorId);
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

  static async accountStats(productId?: string) {
    const where = productId ? { productId } : {};
    const [total, available, reserved, sold, disabled, expired, products] = await Promise.all([
      prisma.productAccount.count({ where }),
      prisma.productAccount.count({ where: sellableInventoryWhere(productId) }),
      prisma.productAccount.count({ where: { ...where, status: "reserved" } }),
      prisma.productAccount.count({ where: purchasedInventoryWhere(productId) }),
      prisma.productAccount.count({ where: { ...where, status: "disabled" } }),
      prisma.productAccount.count({ where: { ...where, status: "expired" } }),
      prisma.product.findMany({
        where: productNotDeletedWhere(),
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

  static async audit(actorId: string, action: string, metadata?: unknown) {
    await prisma.auditLog.create({ data: { actorId, action, metadata: metadata === undefined ? undefined : JSON.stringify(metadata) } });
    this.invalidateDashboardCache();
  }
}
