import { prisma } from "../../services/prisma";
import { eventBus } from "../../services/event-bus.service";

export class ProductService {
  static async getCategories() {
    return prisma.category.findMany({
      where: { isActive: true, deletedAt: null, products: { some: { isActive: true, deletedAt: null, accounts: { some: { status: "available" } } } } },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
      include: { products: { where: { isActive: true, deletedAt: null, accounts: { some: { status: "available" } } }, orderBy: { title: "asc" } } },
    });
  }

  static async getProductsByCategory(categoryId: string) {
    return prisma.product.findMany({
      where: { categoryId, isActive: true, deletedAt: null, category: { is: { isActive: true, deletedAt: null } }, accounts: { some: { status: "available" } } },
      include: { _count: { select: { accounts: { where: { status: "available" } } } } },
      orderBy: { title: "asc" },
    });
  }

  static async listFeaturedProducts(take = 6) {
    return prisma.product.findMany({
      where: { isActive: true, deletedAt: null, category: { is: { isActive: true, deletedAt: null } }, accounts: { some: { status: "available" } } },
      include: { category: true, _count: { select: { accounts: { where: { status: "available" } } } } },
      orderBy: [{ orders: { _count: "desc" } }, { price: "asc" }],
      take,
    });
  }

  static async searchActiveProducts(query: string, take = 10) {
    const normalized = query.trim();
    if (normalized.length < 2) return [];
    return prisma.product.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        category: { is: { isActive: true, deletedAt: null } },
        accounts: { some: { status: "available" } },
        OR: [{ title: { contains: normalized } }, { category: { is: { name: { contains: normalized } } } }],
      },
      include: { category: true, _count: { select: { accounts: { where: { status: "available" } } } } },
      orderBy: [{ price: "asc" }, { title: "asc" }],
      take,
    });
  }

  static async getProduct(productId: string) {
    return prisma.product.findUnique({ where: { id: productId }, include: { category: true } });
  }

  static async create(data: { categoryId?: string; categoryName?: string; title: string; price: number; duration: number }) {
    const category = data.categoryId
      ? await prisma.category.findUniqueOrThrow({ where: { id: data.categoryId } })
      : await prisma.category.upsert({ where: { name: (data.categoryName ?? "عمومی").trim() }, update: { deletedAt: null }, create: { name: (data.categoryName ?? "عمومی").trim() } });

    return prisma.product.create({ data: { categoryId: category.id, title: data.title.trim(), price: data.price, duration: data.duration } });
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
    return prisma.product.findMany({ where: { isActive: true, deletedAt: null }, include: { category: true }, orderBy: { title: "asc" }, take });
  }

  static async availableStock(productId: string) {
    return prisma.productAccount.count({ where: { productId, status: "available" } });
  }


  static async listCategoriesForAdmin(take = 100) {
    return prisma.category.findMany({ where: { deletedAt: null }, orderBy: [{ displayOrder: "asc" }, { name: "asc" }], take });
  }

}
