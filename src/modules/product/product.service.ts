import { prisma } from "../../services/prisma";
import { activeCategoryWhere, activeProductWhere, availableInventoryWhere, categoryNotDeletedWhere } from "./visibility";
import { gbToBytes } from "../xray/xray.service";

export class ProductService {
  static async getCategories() {
    return prisma.category.findMany({
      where: { AND: [activeCategoryWhere(), { products: { some: { AND: [activeProductWhere(), { OR: [{ mode: "xray_auto", stockLimit: { not: null }, soldCount: { lt: 999999999 } }, { accounts: { some: availableInventoryWhere() } }] }] } } }] },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
      include: { products: { where: { AND: [activeProductWhere(), { OR: [{ mode: "xray_auto", stockLimit: { not: null }, soldCount: { lt: 999999999 } }, { accounts: { some: availableInventoryWhere() } }] }] }, orderBy: { title: "asc" } } },
    });
  }

  static async getProductsByCategory(categoryId: string) {
    return prisma.product.findMany({
      where: { categoryId, AND: [activeProductWhere(), { category: { is: activeCategoryWhere() } }, { OR: [{ mode: "xray_auto", stockLimit: { not: null }, soldCount: { lt: 999999999 } }, { accounts: { some: availableInventoryWhere() } }] }] },
      include: { _count: { select: { accounts: { where: availableInventoryWhere() } } } },
      orderBy: { title: "asc" },
    });
  }

  static async listFeaturedProducts(take = 6) {
    return prisma.product.findMany({
      where: { AND: [activeProductWhere(), { category: { is: activeCategoryWhere() } }, { OR: [{ mode: "xray_auto", stockLimit: { not: null }, soldCount: { lt: 999999999 } }, { accounts: { some: availableInventoryWhere() } }] }] },
      include: { category: true, _count: { select: { accounts: { where: availableInventoryWhere() } } } },
      orderBy: [{ orders: { _count: "desc" } }, { price: "asc" }],
      take,
    });
  }

  static async searchActiveProducts(query: string, take = 10) {
    const normalized = query.trim();
    if (normalized.length < 2) return [];
    return prisma.product.findMany({
      where: {
        AND: [activeProductWhere(), { category: { is: activeCategoryWhere() } }, { OR: [{ mode: "xray_auto", stockLimit: { not: null }, soldCount: { lt: 999999999 } }, { accounts: { some: availableInventoryWhere() } }] }],
        OR: [{ title: { contains: normalized } }, { category: { is: { name: { contains: normalized } } } }],
      },
      include: { category: true, _count: { select: { accounts: { where: availableInventoryWhere() } } } },
      orderBy: [{ price: "asc" }, { title: "asc" }],
      take,
    });
  }

  static async getProduct(productId: string) {
    return prisma.product.findUnique({ where: { id: productId }, include: { category: true } });
  }

  static async create(data: { categoryId?: string; categoryName?: string; title: string; price: number; duration: number; trafficGB?: number; stockLimit?: number; inboundIds?: number[]; inboundSnapshot?: string }) {
    const category = data.categoryId
      ? await prisma.category.findFirstOrThrow({ where: { id: data.categoryId, AND: [activeCategoryWhere()] } })
      : await prisma.category.upsert({ where: { name: (data.categoryName ?? "عمومی").trim() }, update: { isActive: true, deletedAt: null }, create: { name: (data.categoryName ?? "عمومی").trim(), isActive: true } });

    const inboundIds = data.inboundIds ?? [];
    return prisma.product.create({ data: { categoryId: category.id, title: data.title.trim(), price: data.price, duration: data.duration, durationDays: data.duration, mode: inboundIds.length ? "xray_auto" : "manual_inventory", trafficBytes: data.trafficGB ? gbToBytes(data.trafficGB) : undefined, stockLimit: data.stockLimit, inboundIds, inboundSnapshot: data.inboundSnapshot } });
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
    if (product?.mode === "xray_auto" && product.stockLimit) return Math.max(product.stockLimit - product.soldCount, 0);
    return prisma.productAccount.count({ where: availableInventoryWhere(productId) });
  }


  static async listCategoriesForAdmin(take = 100) {
    return prisma.category.findMany({ where: categoryNotDeletedWhere(), orderBy: [{ displayOrder: "asc" }, { name: "asc" }], take });
  }

  static async listSelectableCategoriesForAdmin(take = 50) {
    return prisma.category.findMany({ where: activeCategoryWhere(), orderBy: [{ displayOrder: "asc" }, { name: "asc" }], take });
  }

}
