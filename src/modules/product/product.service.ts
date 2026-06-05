import { prisma } from "../../services/prisma";

export class ProductService {
  static async getAll() {
    return prisma.product.findMany({
      include: {
        items: true,
      },
    });
  }

  static async create(data: { title: string; category: string; price: number; duration: number }) {
    return prisma.product.create({
      data,
    });
  }
}
