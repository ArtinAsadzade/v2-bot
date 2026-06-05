import { prisma } from "./prisma";

export class AnalyticsService {
  static async dashboard() {
    const users = await prisma.user.count();

    const products = await prisma.product.count();

    const deposits = await prisma.deposit.count({
      where: {
        status: "approved",
      },
    });

    return {
      users,
      products,
      deposits,
    };
  }
}
