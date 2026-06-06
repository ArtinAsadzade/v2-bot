import { prisma } from "../../services/prisma";

export class ProductService {
  static async getCategories() {
    return prisma.category.findMany({
      orderBy: { name: "asc" },
      include: { products: { where: { isActive: true }, orderBy: { title: "asc" } } },
    });
  }

  static async getProductsByCategory(categoryId: string) {
    return prisma.product.findMany({
      where: { categoryId, isActive: true },
      orderBy: { title: "asc" },
    });
  }

  static async getProduct(productId: string) {
    return prisma.product.findUnique({ where: { id: productId }, include: { category: true } });
  }

  static async create(data: { categoryName: string; title: string; price: number; duration: number }) {
    const category = await prisma.category.upsert({
      where: { name: data.categoryName.trim() },
      update: {},
      create: { name: data.categoryName.trim() },
    });

    return prisma.product.create({
      data: { categoryId: category.id, title: data.title.trim(), price: data.price, duration: data.duration },
    });
  }

  static async addAccount(productId: string, data: { username: string; password: string; config: string }) {
    return prisma.productAccount.create({
      data: { productId, username: data.username, password: data.password, config: data.config, status: "available" },
    });
  }

  static async availableStock(productId: string) {
    return prisma.productAccount.count({ where: { productId, status: "available" } });
  }
}
