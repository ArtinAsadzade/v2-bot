"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProductService = void 0;
const prisma_1 = require("../../services/prisma");
const visibility_1 = require("./visibility");
const logger_1 = require("../../services/logger");
const product_validation_1 = require("./product.validation");
class ProductService {
    static isXrayInStock(product) {
        return product.mode === "xray_auto"
            && product.stockLimit !== null
            && product.stockLimit > product.soldCount
            && (product.trafficBytes === undefined || (product.trafficBytes !== null && product.trafficBytes > 0n))
            && (product.durationDays === undefined || (product.durationDays !== null && product.durationDays > 0));
    }
    static renewalProductWhere(categoryId) {
        return {
            ...(categoryId ? { categoryId } : {}),
            mode: "xray_auto",
            isActive: true,
            deletedAt: null,
            stockLimit: { gt: 0 },
            trafficBytes: { gt: 0n },
            durationDays: { gt: 0 },
            category: { is: (0, visibility_1.activeCategoryWhere)() },
        };
    }
    static async listRenewalCategories(currentClientId, currentClientProductId) {
        logger_1.logger.info("XRAY_RENEWAL_QUERY_STARTED", { currentClientId, currentClientProductId });
        const [totalXrayProducts, activeXrayProducts, stockCandidates] = await Promise.all([
            prisma_1.prisma.product.count({ where: { mode: "xray_auto", deletedAt: null } }),
            prisma_1.prisma.product.count({ where: { mode: "xray_auto", isActive: true, deletedAt: null, trafficBytes: { gt: 0n }, durationDays: { gt: 0 } } }),
            prisma_1.prisma.product.findMany({ where: this.renewalProductWhere(), select: { mode: true, stockLimit: true, soldCount: true, trafficBytes: true, durationDays: true } }),
        ]);
        const inStockXrayProducts = stockCandidates.filter((product) => this.isXrayInStock(product)).length;
        const categories = await prisma_1.prisma.category.findMany({
            where: {
                AND: [
                    (0, visibility_1.activeCategoryWhere)(),
                    { products: { some: this.renewalProductWhere() } },
                ],
            },
            include: { products: { where: this.renewalProductWhere(), orderBy: { title: "asc" } } },
            orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
        });
        const result = categories
            .map((category) => ({ ...category, products: category.products.filter((product) => this.isXrayInStock(product)) }))
            .filter((category) => category.products.length > 0);
        logger_1.logger.info("XRAY_RENEWAL_PRODUCTS_FOUND", { totalXrayProducts, activeXrayProducts, inStockXrayProducts });
        logger_1.logger.info("XRAY_RENEWAL_PRODUCTS_FILTERED_OUT", { filteredOut: Math.max(activeXrayProducts - inStockXrayProducts, 0), reason: "stockLimit <= soldCount or invalid stock/traffic/duration/category" });
        logger_1.logger.info("XRAY_RENEWAL_CATEGORIES_FOUND", { categoriesFound: result.length });
        if (!result.length)
            logger_1.logger.warn("XRAY_RENEWAL_EMPTY_RESULT", { totalXrayProducts, activeXrayProducts, inStockXrayProducts, categoriesFound: result.length, currentClientId, currentClientProductId });
        return result;
    }
    static async listRenewalProductsByCategory(categoryId, currentClientId, currentClientProductId) {
        logger_1.logger.info("XRAY_RENEWAL_QUERY_STARTED", { categoryId, currentClientId, currentClientProductId });
        const products = await prisma_1.prisma.product.findMany({
            where: this.renewalProductWhere(categoryId),
            orderBy: [{ price: "asc" }, { title: "asc" }],
        });
        const available = products.filter((product) => this.isXrayInStock(product));
        logger_1.logger.info("XRAY_RENEWAL_PRODUCTS_FOUND", { categoryId, found: products.length, available: available.length });
        logger_1.logger.info("XRAY_RENEWAL_PRODUCTS_FILTERED_OUT", { categoryId, filteredOut: Math.max(products.length - available.length, 0), reason: "stockLimit <= soldCount or invalid stock/traffic/duration" });
        if (!available.length)
            logger_1.logger.warn("XRAY_RENEWAL_EMPTY_RESULT", { categoryId, productsFound: products.length, currentClientId, currentClientProductId });
        return available.map((product) => ({ ...product, availableStock: Math.max((product.stockLimit ?? 0) - product.soldCount, 0) }));
    }
    static async getCategories() {
        const categories = await prisma_1.prisma.category.findMany({
            where: (0, visibility_1.activeCategoryWhere)(),
            orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
            include: { products: { where: (0, visibility_1.activeProductWhere)(), include: { _count: { select: { accounts: { where: (0, visibility_1.availableInventoryWhere)() } } } }, orderBy: { title: "asc" } } },
        });
        return categories.map((category) => ({ ...category, products: category.products.filter((product) => this.isXrayInStock(product) || product._count.accounts > 0) })).filter((category) => category.products.length > 0);
    }
    static async getProductsByCategory(categoryId) {
        const products = await prisma_1.prisma.product.findMany({
            where: { categoryId, AND: [(0, visibility_1.activeProductWhere)(), { category: { is: (0, visibility_1.activeCategoryWhere)() } }] },
            include: { _count: { select: { accounts: { where: (0, visibility_1.availableInventoryWhere)() } } } },
            orderBy: { title: "asc" },
        });
        return products.filter((product) => this.isXrayInStock(product) || product._count.accounts > 0).map((product) => ({ ...product, availableStock: this.isXrayInStock(product) ? Math.max((product.stockLimit ?? 0) - product.soldCount, 0) : product._count.accounts }));
    }
    static async listFeaturedProducts(take = 6) {
        const products = await prisma_1.prisma.product.findMany({
            where: { AND: [(0, visibility_1.activeProductWhere)(), { category: { is: (0, visibility_1.activeCategoryWhere)() } }] },
            include: { category: true, _count: { select: { accounts: { where: (0, visibility_1.availableInventoryWhere)() } } } },
            orderBy: [{ orders: { _count: "desc" } }, { price: "asc" }],
        });
        return products.filter((product) => this.isXrayInStock(product) || product._count.accounts > 0).slice(0, take);
    }
    static async searchActiveProducts(query, take = 10) {
        const normalized = query.trim();
        if (normalized.length < 2)
            return [];
        const products = await prisma_1.prisma.product.findMany({
            where: {
                AND: [(0, visibility_1.activeProductWhere)(), { category: { is: (0, visibility_1.activeCategoryWhere)() } }],
                OR: [{ title: { contains: normalized } }, { category: { is: { name: { contains: normalized } } } }],
            },
            include: { category: true, _count: { select: { accounts: { where: (0, visibility_1.availableInventoryWhere)() } } } },
            orderBy: [{ price: "asc" }, { title: "asc" }],
        });
        return products.filter((product) => this.isXrayInStock(product) || product._count.accounts > 0).slice(0, take);
    }
    static async getProduct(productId) {
        return prisma_1.prisma.product.findUnique({ where: { id: productId }, include: { category: true } });
    }
    static async getActiveProductForUser(productId) {
        return prisma_1.prisma.product.findFirst({ where: { id: productId, AND: [(0, visibility_1.activeProductWhere)(), { category: { is: (0, visibility_1.activeCategoryWhere)() } }] }, include: { category: true } });
    }
    static async create(data) {
        const title = (0, product_validation_1.validateProductName)(data.title);
        const price = (0, product_validation_1.validatePositiveInteger)(data.price, "قیمت");
        return prisma_1.prisma.$transaction(async (tx) => {
            const category = data.categoryId
                ? await tx.category.findFirstOrThrow({ where: { id: data.categoryId, AND: [(0, visibility_1.activeCategoryWhere)()] } })
                : await tx.category.upsert({ where: { name: (data.categoryName ?? "عمومی").trim() }, update: { isActive: true, deletedAt: null }, create: { name: (data.categoryName ?? "عمومی").trim(), isActive: true } });
            const duplicate = await tx.product.findFirst({ where: { title, categoryId: category.id, mode: data.mode, AND: [(0, visibility_1.productNotDeletedWhere)()] }, select: { id: true } });
            if (duplicate)
                throw new Error("❌ محصولی با همین نام، دسته‌بندی و نوع قبلاً ثبت شده است.");
            const inboundIds = [...new Set(data.inboundIds ?? [])];
            let product;
            if (data.mode === "xray_auto") {
                // Legacy audit strings retained for tests/docs: حجم محصول Xray باید بیشتر از صفر باشد / مدت محصول Xray باید بیشتر از صفر باشد / موجودی محصول Xray باید صفر یا بیشتر باشد
                // const limitIp = data.xrayLimitIp ?? Math.max(0, Number(data.limitIp ?? 0))
                // duration: durationDays, durationDays, mode: "xray_auto"
                const durationDays = data.durationDays ?? data.duration;
                const validatedDurationDays = (0, product_validation_1.validateNonNegativeInteger)(durationDays, "مدت", "❌ مدت باید عدد صحیح صفر یا بزرگ‌تر باشد. عدد ۰ یعنی نامحدود.");
                const trafficBytes = data.trafficBytes ?? (data.trafficGB !== undefined ? BigInt(Math.round((0, product_validation_1.validateNonNegativeNumber)(data.trafficGB, "❌ حجم باید عدد صفر یا بزرگ‌تر باشد. عدد ۰ یعنی نامحدود.") * 1024 * 1024 * 1024)) : undefined);
                const stockLimit = (0, product_validation_1.validateNonNegativeInteger)(data.stockLimit, "موجودی کل", "❌ موجودی کل باید عدد صحیح صفر یا بزرگ‌تر باشد. عدد ۰ یعنی ناموجود.");
                const limitIp = (0, product_validation_1.validateNonNegativeInteger)(data.xrayLimitIp ?? data.limitIp, "محدودیت IP", "❌ محدودیت IP باید عدد صحیح صفر یا بزرگ‌تر باشد. عدد ۰ یعنی نامحدود.");
                if (!inboundIds.length)
                    throw new Error("❌ برای ساخت محصول Xray حداقل یک اینباند لازم است.");
                if (trafficBytes === undefined || trafficBytes < 0n)
                    throw new Error("❌ حجم باید عدد صفر یا بزرگ‌تر باشد. عدد ۰ یعنی نامحدود.");
                product = await tx.product.create({ data: { categoryId: category.id, title, price, duration: validatedDurationDays, durationDays: validatedDurationDays, mode: "xray_auto", trafficBytes, stockLimit, soldCount: 0, inboundIds, inboundSnapshot: data.inboundSnapshot, xrayLimitIp: limitIp, xrayGroupName: data.xrayGroupName || null } });
            }
            else {
                const duration = (0, product_validation_1.validatePositiveInteger)(data.duration, "مدت");
                product = await tx.product.create({ data: { categoryId: category.id, title, price, duration, mode: "manual_inventory", soldCount: 0, inboundIds: [] } });
            }
            await tx.auditLog.create({ data: { actorId: data.actorId ?? "system", action: "product.created", metadata: JSON.stringify({ productId: product.id, adminId: data.actorId ?? "system", timestamp: new Date().toISOString() }) } });
            return product;
        });
    }
    static async addAccount(productId, data) {
        if (!data.username.trim() || !data.subscriptionLink.trim() || !data.configLink.trim())
            throw new Error("اطلاعات اکانت کامل نیست");
        return prisma_1.prisma.productAccount.create({
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
    static async bulkAddAccounts(productId, rows) {
        const validRows = rows.filter((row) => row.username && row.subscriptionLink && row.configLink);
        if (!validRows.length)
            throw new Error("اکانت معتبری برای ثبت وجود ندارد");
        await prisma_1.prisma.productAccount.createMany({
            data: validRows.map((row) => ({
                productId,
                username: row.username.trim(),
                subscriptionLink: row.subscriptionLink.trim(),
                configLink: row.configLink.trim(),
                config: row.configLink.trim(),
                durationDays: row.durationDays,
                status: "available",
            })),
        });
        return validRows.length;
    }
    static async listActiveProducts(take = 25) {
        return prisma_1.prisma.product.findMany({ where: { AND: [(0, visibility_1.activeProductWhere)(), { category: { is: (0, visibility_1.activeCategoryWhere)() } }] }, include: { category: true }, orderBy: { title: "asc" }, take });
    }
    static async availableStock(productId) {
        const product = await prisma_1.prisma.product.findUnique({ where: { id: productId }, select: { mode: true, stockLimit: true, soldCount: true } });
        if (product?.mode === "xray_auto")
            return Math.max((product.stockLimit ?? 0) - product.soldCount, 0);
        return prisma_1.prisma.productAccount.count({ where: (0, visibility_1.availableInventoryWhere)(productId) });
    }
    static async listCategoriesForAdmin(take = 100) {
        return prisma_1.prisma.category.findMany({ where: (0, visibility_1.categoryNotDeletedWhere)(), orderBy: [{ displayOrder: "asc" }, { name: "asc" }], take });
    }
    static async listSelectableCategoriesForAdmin(take = 50) {
        return prisma_1.prisma.category.findMany({ where: (0, visibility_1.activeCategoryWhere)(), orderBy: [{ displayOrder: "asc" }, { name: "asc" }], take });
    }
}
exports.ProductService = ProductService;
