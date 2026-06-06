import { prisma } from "../../services/prisma";
import { CouponService } from "../coupon/coupon.service";
import { WalletService } from "../wallet/wallet.service";

export class PurchaseService {
  static async buyProduct(userId: string, productId: string, couponCode?: string) {
    return prisma.$transaction(async (tx) => {
      const product = await tx.product.findFirst({ where: { id: productId, isActive: true } });
      if (!product) throw new Error("محصول پیدا نشد");

      let discountAmount = 0;
      let couponId: string | null = null;
      let couponMaxUses = 0;
      if (couponCode) {
        const coupon = await CouponService.validateForUser(couponCode, userId, tx);
        couponId = coupon.id;
        discountAmount = Math.floor((product.price * coupon.discountPercent) / 100);
        couponMaxUses = coupon.maxUses;
      }

      const totalAmount = Math.max(product.price - discountAmount, 0);
      const account = await tx.productAccount.findFirst({
        where: { productId, status: "available" },
        orderBy: { createdAt: "asc" },
      });
      if (!account) throw new Error("موجودی این محصول تمام شده است");

      const reserved = await tx.productAccount.updateMany({
        where: { id: account.id, status: "available" },
        data: { status: "reserved", reservedBy: userId, reservedAt: new Date() },
      });
      if (reserved.count !== 1) throw new Error("این اکانت هم‌اکنون رزرو شد؛ دوباره تلاش کنید");

      if (totalAmount > 0) {
        await WalletService.debit(userId, totalAmount, `خرید محصول ${product.title}`, tx);
      }

      if (couponId) {
        const couponUpdated = await tx.coupon.updateMany({
          where: { id: couponId, usedCount: { lt: couponMaxUses }, expiresAt: { gt: new Date() } },
          data: { usedCount: { increment: 1 } },
        });
        if (couponUpdated.count !== 1) throw new Error("کد تخفیف دیگر قابل استفاده نیست");
      }

      const order = await tx.order.create({
        data: { userId, productId, couponId, totalAmount, discountAmount, status: "completed" },
      });

      await tx.orderItem.create({
        data: {
          orderId: order.id,
          productId,
          productAccountId: account.id,
          deliveredUsername: account.username,
          deliveredPassword: account.password,
          deliveredConfig: account.config,
        },
      });

      if (couponId) {
        await tx.couponUsage.create({ data: { couponId, userId, orderId: order.id } });
      }

      const sold = await tx.productAccount.updateMany({
        where: { id: account.id, status: "reserved", reservedBy: userId },
        data: { status: "sold", soldTo: userId, soldAt: new Date() },
      });
      if (sold.count !== 1) throw new Error("تحویل اکانت ناموفق بود");

      return { order, product, account, totalAmount, discountAmount };
    });
  }
}
