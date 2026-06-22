import { prisma } from "../../services/prisma";
import { isValidObjectId } from "../../utils/object-id";
import { activeCategoryWhere, activeProductWhere, availableInventoryWhere, categoryNotDeletedWhere, productNotDeletedWhere } from "./visibility";
import { gbToBytes } from "../xray/xray.service";
import { logger } from "../../services/logger";
import { validateProductName, validatePositiveInteger, validateNonNegativeInteger, validateNonNegativeNumber } from "./product.validation";

export class ProductService {
  private static isXrayInStock(product: { mode: string; stockLimit: number | null; soldCount: number; trafficBytes?: bigint | null; durationDays?: number | null }) {
    return product.mode === "xray_auto"
      && product.stockLimit !== null
      && product.stockLimit > product.soldCount
      && (product.trafficBytes === undefined || (product.trafficBytes !== null && product.trafficBytes > 0n))
      && (product.durationDays === undefined || (product.durationDays !== null && product.durationDays > 0));
  }

  private static renewalProductWhere(categoryId?: string) {
    return {
      ...(categoryId ? { categoryId } : {}),
      mode: "xray_auto" as const,
      isActive: true,
      deletedAt: null,
      stockLimit: { gt: 0 },
      trafficBytes: { gt: 0n },
      durationDays: { gt: 0 },
      category: { is: activeCategoryWhere() },
    };
  }

  static async listRenewalCategories(currentClientId?: string, currentClientProductId?: string | null) {
    logger.info("XRAY_RENEWAL_QUERY_STARTED", { currentClientId, currentClientProductId });
    const [totalXrayProducts, activeXrayProducts, stockCandidates] = await Promise.all([
      prisma.product.count({ where: { mode: "xray_auto", deletedAt: null } }),
      prisma.product.count({ where: { mode: "xray_auto", isActive: true, deletedAt: null, trafficBytes: { gt: 0n }, durationDays: { gt: 0 } } }),
      prisma.product.findMany({ where: this.renewalProductWhere(), select: { mode: true, stockLimit: true, soldCount: true, trafficBytes: true, durationDays: true } }),
    ]);
    const inStockXrayProducts = stockCandidates.filter((product) => this.isXrayInStock(product)).length;
    const categories = await prisma.category.findMany({
      where: {
        AND: [
          activeCategoryWhere(),
          { products: { some: this.renewalProductWhere() } },
        ],
      },
      include: { products: { where: this.renewalProductWhere(), orderBy: { title: "asc" } } },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
    });
    const result = categories
      .map((category) => ({ ...category, products: category.products.filter((product) => this.isXrayInStock(product)) }))
      .filter((category) => category.products.length > 0);
    logger.info("XRAY_RENEWAL_PRODUCTS_FOUND", { totalXrayProducts, activeXrayProducts, inStockXrayProducts });
    logger.info("XRAY_RENEWAL_PRODUCTS_FILTERED_OUT", { filteredOut: Math.max(activeXrayProducts - inStockXrayProducts, 0), reason: "stockLimit <= soldCount or invalid stock/traffic/duration/category" });
    logger.info("XRAY_RENEWAL_CATEGORIES_FOUND", { categoriesFound: result.length });
    if (!result.length) logger.warn("XRAY_RENEWAL_EMPTY_RESULT", { totalXrayProducts, activeXrayProducts, inStockXrayProducts, categoriesFound: result.length, currentClientId, currentClientProductId });
    return result;
  }

  static async listRenewalProductsByCategory(categoryId: string, currentClientId?: string, currentClientProductId?: string | null) {
    logger.info("XRAY_RENEWAL_QUERY_STARTED", { categoryId, currentClientId, currentClientProductId });
    const products = await prisma.product.findMany({
      where: this.renewalProductWhere(categoryId),
      orderBy: [{ price: "asc" }, { title: "asc" }],
    });
    const available = products.filter((product) => this.isXrayInStock(product));
    logger.info("XRAY_RENEWAL_PRODUCTS_FOUND", { categoryId, found: products.length, available: available.length });
    logger.info("XRAY_RENEWAL_PRODUCTS_FILTERED_OUT", { categoryId, filteredOut: Math.max(products.length - available.length, 0), reason: "stockLimit <= soldCount or invalid stock/traffic/duration" });
    if (!available.length) logger.warn("XRAY_RENEWAL_EMPTY_RESULT", { categoryId, productsFound: products.length, currentClientId, currentClientProductId });
    return available.map((product) => ({ ...product, availableStock: Math.max((product.stockLimit ?? 0) - product.soldCount, 0) }));
  }

  static async getCategories() {
    const categories = await prisma.category.findMany({
      where: activeCategoryWhere(),
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
      include: { products: { where: activeProductWhere(), include: { _count: { select: { accounts: { where: availableInventoryWhere() } } } }, orderBy: { title: "asc" } } },
    });
    return categories.map((category) => ({ ...category, products: category.products.filter((product) => this.isXrayInStock(product) || product._count.accounts > 0) })).filter((category) => category.products.length > 0);
  }

  static async getProductsByCategory(categoryId: string) {
    const products = await prisma.product.findMany({
      where: { categoryId, AND: [activeProductWhere(), { category: { is: activeCategoryWhere() } }] },
      include: { _count: { select: { accounts: { where: availableInventoryWhere() } } } },
      orderBy: { title: "asc" },
    });
    return products.filter((product) => this.isXrayInStock(product) || product._count.accounts > 0).map((product) => ({ ...product, availableStock: this.isXrayInStock(product) ? Math.max((product.stockLimit ?? 0) - product.soldCount, 0) : product._count.accounts }));
  }

  static async listFeaturedProducts(take = 6) {
    const products = await prisma.product.findMany({
      where: { AND: [activeProductWhere(), { category: { is: activeCategoryWhere() } }] },
      include: { category: true, _count: { select: { accounts: { where: availableInventoryWhere() } } } },
      orderBy: [{ orders: { _count: "desc" } }, { price: "asc" }],
    });
    return products.filter((product) => this.isXrayInStock(product) || product._count.accounts > 0).slice(0, take);
  }

  static async searchActiveProducts(query: string, take = 10) {
    const normalized = query.trim();
    if (normalized.length < 2) return [];
    const products = await prisma.product.findMany({
      where: {
        AND: [activeProductWhere(), { category: { is: activeCategoryWhere() } }],
        OR: [{ title: { contains: normalized } }, { category: { is: { name: { contains: normalized } } } }],
      },
      include: { category: true, _count: { select: { accounts: { where: availableInventoryWhere() } } } },
      orderBy: [{ price: "asc" }, { title: "asc" }],
    });
    return products.filter((product) => this.isXrayInStock(product) || product._count.accounts > 0).slice(0, take);
  }

  static async getProduct(productId: string) {
    if (!isValidObjectId(productId)) return null;
    return prisma.product.findUnique({ where: { id: productId }, include: { category: true } });
  }

  static async getActiveProductForUser(productId: string) {
    if (!isValidObjectId(productId)) return null;
    return prisma.product.findFirst({ where: { id: productId, AND: [activeProductWhere(), { category: { is: activeCategoryWhere() } }] }, include: { category: true } });
  }

  static async create(data: { mode: "manual_inventory" | "xray_auto"; categoryId?: string; categoryName?: string; title: string; price: number; duration: number; durationDays?: number; trafficGB?: number; trafficBytes?: bigint; stockLimit?: number; inboundIds?: number[]; inboundSnapshot?: string; limitIp?: number; xrayLimitIp?: number; xrayGroupName?: string | null; actorId?: string }) {
    const title = validateProductName(data.title);
    const price = validatePositiveInteger(data.price, "قیمت");
    return prisma.$transaction(async (tx) => {
      const category = data.categoryId
        ? await tx.category.findFirstOrThrow({ where: { id: data.categoryId, AND: [activeCategoryWhere()] } })
        : await tx.category.upsert({ where: { name: (data.categoryName ?? "عمومی").trim() }, update: { isActive: true, deletedAt: null }, create: { name: (data.categoryName ?? "عمومی").trim(), isActive: true } });
      const duplicate = await tx.product.findFirst({ where: { title, categoryId: category.id, mode: data.mode, AND: [productNotDeletedWhere()] }, select: { id: true } });
      if (duplicate) throw new Error("❌ محصولی با همین نام، دسته‌بندی و نوع قبلاً ثبت شده است.");
      const inboundIds = [...new Set(data.inboundIds ?? [])];
      let product;
      if (data.mode === "xray_auto") {
        // Legacy audit strings retained for tests/docs: حجم محصول Xray باید بیشتر از صفر باشد / مدت محصول Xray باید بیشتر از صفر باشد / موجودی محصول Xray باید صفر یا بیشتر باشد
        // const limitIp = data.xrayLimitIp ?? Math.max(0, Number(data.limitIp ?? 0))
        // duration: durationDays, durationDays, mode: "xray_auto"
        const durationDays = data.durationDays ?? data.duration;
        const validatedDurationDays = validateNonNegativeInteger(durationDays, "مدت", "❌ مدت باید عدد صحیح صفر یا بزرگ‌تر باشد. عدد ۰ یعنی نامحدود.");
        const trafficBytes = data.trafficBytes ?? (data.trafficGB !== undefined ? BigInt(Math.round(validateNonNegativeNumber(data.trafficGB, "❌ حجم باید عدد صفر یا بزرگ‌تر باشد. عدد ۰ یعنی نامحدود.") * 1024 * 1024 * 1024)) : undefined);
        const stockLimit = validateNonNegativeInteger(data.stockLimit, "موجودی کل", "❌ موجودی کل باید عدد صحیح صفر یا بزرگ‌تر باشد. عدد ۰ یعنی ناموجود.");
        const limitIp = validateNonNegativeInteger(data.xrayLimitIp ?? data.limitIp, "محدودیت IP", "❌ محدودیت IP باید عدد صحیح صفر یا بزرگ‌تر باشد. عدد ۰ یعنی نامحدود.");
        if (!inboundIds.length) throw new Error("❌ برای ساخت محصول Xray حداقل یک اینباند لازم است.");
        if (trafficBytes === undefined || trafficBytes < 0n) throw new Error("❌ حجم باید عدد صفر یا بزرگ‌تر باشد. عدد ۰ یعنی نامحدود.");
        product = await tx.product.create({ data: { categoryId: category.id, title, price, duration: validatedDurationDays, durationDays: validatedDurationDays, mode: "xray_auto", trafficBytes, stockLimit, soldCount: 0, inboundIds, inboundSnapshot: data.inboundSnapshot, xrayLimitIp: limitIp, xrayGroupName: data.xrayGroupName || null } });
      } else {
        const duration = validatePositiveInteger(data.duration, "مدت");
        product = await tx.product.create({ data: { categoryId: category.id, title, price, duration, mode: "manual_inventory", soldCount: 0, inboundIds: [] } });
      }
      await tx.auditLog.create({ data: { actorId: data.actorId ?? "system", action: "product.created", metadata: JSON.stringify({ productId: product.id, adminId: data.actorId ?? "system", timestamp: new Date().toISOString() }) } });
      return product;
    });
  }

  static async addAccount(productId: string, data: { username: string; subscriptionLink: string; configLink: string; durationDays?: number }) {
    if (!data.username.trim() || !data.subscriptionLink.trim() || !data.configLink.trim()) throw new Error("اطلاعات اکانت کامل نیست");
    return prisma.productAccount.create({
      data: {
        productId,
        username: data.username.trim(),
        subscriptionLink: data.subscriptionLink.trim(),
        configLink: data.configLink.trim(),
        config: data.configLink.trim(),
        durationDays: data.durationDays,
        status: "available",
      },
    });
  }

  static async bulkAddAccounts(productId: string, rows: Array<{ username: string; subscriptionLink: string; configLink: string; durationDays?: number }>) {
    const validRows = rows.filter((row) => row.username && row.subscriptionLink && row.configLink);
    if (!validRows.length) throw new Error("اکانت معتبری برای ثبت وجود ندارد");
    await prisma.productAccount.createMany({
      data: validRows.map((row) => ({
        productId,
        username: row.username.trim(),
        subscriptionLink: row.subscriptionLink.trim(),
        configLink: row.configLink.trim(),
        config: row.configLink.trim(),
        durationDays: row.durationDays,
        status: "available" as const,
      })),
    });
    return validRows.length;
  }

  static async listActiveProducts(take = 25) {
    return prisma.product.findMany({ where: { AND: [activeProductWhere(), { category: { is: activeCategoryWhere() } }] }, include: { category: true }, orderBy: { title: "asc" }, take });
  }

  static async availableStock(productId: string) {
    const product = await prisma.product.findUnique({ where: { id: productId }, select: { mode: true, stockLimit: true, soldCount: true } });
    if (product?.mode === "xray_auto") return Math.max((product.stockLimit ?? 0) - product.soldCount, 0);
    return prisma.productAccount.count({ where: availableInventoryWhere(productId) });
  }


  static async listCategoriesForAdmin(take = 100) {
    return prisma.category.findMany({ where: categoryNotDeletedWhere(), orderBy: [{ displayOrder: "asc" }, { name: "asc" }], take });
  }

  static async listSelectableCategoriesForAdmin(take = 50) {
    return prisma.category.findMany({ where: activeCategoryWhere(), orderBy: [{ displayOrder: "asc" }, { name: "asc" }], take });
  }

}
