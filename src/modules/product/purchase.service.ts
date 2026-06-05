import { prisma } from "../../services/prisma";

export class PurchaseService {
  static async buyProduct(userId: string, productId: string) {
    return prisma.$transaction(async (tx) => {
      // 1. get user
      const user = await tx.user.findUnique({
        where: { id: userId },
      });

      if (!user) throw new Error("User not found");

      // 2. get available item (VERY IMPORTANT)
      const item = await tx.productItem.findFirst({
        where: {
          productId,
          isSold: false,
        },
      });

      if (!item) {
        throw new Error("No stock available");
      }

      // 3. get product
      const product = await tx.product.findUnique({
        where: { id: productId },
      });

      if (!product) throw new Error("Product not found");

      // 4. check balance
      if (user.balance < product.price) {
        throw new Error("Insufficient balance");
      }

      // 5. deduct balance
      await tx.user.update({
        where: { id: userId },
        data: {
          balance: {
            decrement: product.price,
          },
        },
      });

      // 6. mark item as sold (LOCK)
      await tx.productItem.update({
        where: { id: item.id },
        data: {
          isSold: true,
          soldTo: userId,
          soldAt: new Date(),
        },
      });

      // 7. create transaction
      await tx.transaction.create({
        data: {
          userId,
          amount: product.price,
          type: "debit",
          reason: `Purchase: ${product.title}`,
        },
      });

      return item;
    });
  }
}
