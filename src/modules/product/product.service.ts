import { prisma } from "../../services/prisma";
import { eventBus } from "../../services/event-bus.service";

export class ProductService {
  static async getCategories() {
    return prisma.category.findMany({
      orderBy: { name: "asc" },
      include: { products: { where: { isActive: true }, orderBy: { title: "asc" } } },
    });
  }

  static async getProductsByCategory(categoryId: string) {
    return prisma.product.findMany({ where: { categoryId, isActive: true }, orderBy: { title: "asc" } });
  }

  static async getProduct(productId: string) {
    return prisma.product.findUnique({ where: { id: productId }, include: { category: true } });
  }

  static async create(data: { categoryId?: string; categoryName?: string; title: string; price: number; duration: number }) {
    const category = data.categoryId
      ? await prisma.category.findUniqueOrThrow({ where: { id: data.categoryId } })
      : await prisma.category.upsert({ where: { name: (data.categoryName ?? "عمومی").trim() }, update: {}, create: { name: (data.categoryName ?? "عمومی").trim() } });

    return prisma.product.create({ data: { categoryId: category.id, title: data.title.trim(), price: data.price, duration: data.duration } });
  }

  static async addAccount(productId: string, data: { username: string; password: string; config: string }) {
    return prisma.productAccount.create({ data: { productId, username: data.username.trim(), password: data.password.trim(), config: data.config.trim(), status: "available" } });
  }

  static async bulkAddAccounts(productId: string, rows: Array<{ username: string; password: string; config: string }>) {
    const validRows = rows.filter((row) => row.username && row.password && row.config);
    if (!validRows.length) throw new Error("اکانت معتبری برای ثبت وجود ندارد");
    await prisma.productAccount.createMany({ data: validRows.map((row) => ({ productId, username: row.username.trim(), password: row.password.trim(), config: row.config.trim(), status: "available" })) });
    return validRows.length;
  }

  static async listActiveProducts(take = 25) {
    return prisma.product.findMany({ where: { isActive: true }, include: { category: true }, orderBy: { title: "asc" }, take });
  }

  static async availableStock(productId: string) {
    return prisma.productAccount.count({ where: { productId, status: "available" } });
  }

  static async claimFreeAccount(userId: string, productId: string) {
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new Error("محصول پیدا نشد");
    const account = await prisma.$transaction(async (tx) => {
      const candidate = await tx.productAccount.findFirst({ where: { productId, status: "available" }, orderBy: { createdAt: "asc" } });
      if (!candidate) throw new Error("اکانت رایگان برای این محصول موجود نیست");
      const updated = await tx.productAccount.updateMany({ where: { id: candidate.id, status: "available" }, data: { status: "sold", soldTo: userId, soldAt: new Date() } });
      if (updated.count !== 1) throw new Error("تحویل اکانت ناموفق بود");
      return candidate;
    });
    eventBus.emit("free_account.assigned", { userId, productId, accountId: account.id, reason: "manual_claim" });
    return { product, account };
  }
}
