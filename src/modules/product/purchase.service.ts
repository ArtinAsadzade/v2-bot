import { prisma } from "../../services/prisma";
import { CouponService } from "../coupon/coupon.service";
import { WalletService } from "../wallet/wallet.service";
import { eventBus } from "../../services/event-bus.service";
import { AdminService } from "../admin/admin.service";

export class PurchaseService {
  static async buyProduct(userId: string, productId: string, couponCode?: string) {
    return prisma.$transaction(async (tx) => {
      const product = await tx.product.findFirst({ where: { id: productId, isActive: true, deletedAt: null, category: { is: { isActive: true, deletedAt: null } } } });
      if (!product) throw new Error("محصول پیدا نشد");

      let discountAmount = 0;
      let couponId: string | null = null;
      let couponMaxUses = 0;
      const originalAmount = product.price;
      let totalAmount = originalAmount;
      if (couponCode) {
        const coupon = await CouponService.validateForUser(couponCode, userId, tx, originalAmount);
        couponId = coupon.id;
        const calculation = CouponService.calculate(coupon, originalAmount);
        discountAmount = calculation.discountAmount;
        totalAmount = calculation.finalAmount;
        couponMaxUses = coupon.maxUses;
      }
      const account = await tx.productAccount.findFirst({
        where: { productId, status: "available" },
        orderBy: { createdAt: "asc" },
      });
      if (!account) throw new Error("موجودی این محصول تمام شده است");

      const reservedAt = new Date();
      const reserved = await tx.productAccount.updateMany({
        where: { id: account.id, productId, status: "available", soldTo: null, soldAt: null },
        data: { status: "reserved", reservedBy: userId, reservedAt },
      });
      if (reserved.count !== 1) throw new Error("این اکانت هم‌اکنون رزرو شد؛ دوباره تلاش کنید");

      await tx.productAccountHistory.create({
        data: {
          accountId: account.id,
          actorId: userId,
          action: "account.reserve",
          fromValue: "available",
          toValue: "reserved",
          metadata: JSON.stringify({ productId, reservedAt }),
        },
      });

      if (totalAmount > 0) {
        await WalletService.debit(userId, totalAmount, `خرید محصول ${product.title}`, tx);
      }

      if (couponId) {
        const couponUpdated = await tx.coupon.updateMany({
          where: { id: couponId, status: "active", usedCount: { lt: couponMaxUses }, expiresAt: { gt: new Date() } },
          data: { usedCount: { increment: 1 } },
        });
        if (couponUpdated.count !== 1) throw new Error("کد تخفیف دیگر قابل استفاده نیست");
      }

      const order = await tx.order.create({
        data: { userId, productId, couponId, originalAmount, totalAmount, finalPaidAmount: totalAmount, discountAmount, status: "completed" },
      });

      const purchaseDate = new Date();
      const durationDays = account.durationDays ?? product.duration;
      const expiresAt = new Date(purchaseDate.getTime() + durationDays * 86_400_000);

      const orderItem = await tx.orderItem.create({
        data: {
          orderId: order.id,
          productId,
          productAccountId: account.id,
          deliveredUsername: account.username,
          deliveredPassword: account.password,
          deliveredSubscriptionLink: account.subscriptionLink,
          deliveredConfigLink: account.configLink,
          deliveredConfig: account.configLink || account.config,
          purchaseDate,
          expiresAt,
          isActive: true,
        },
      });

      if (couponId) {
        await tx.couponUsage.create({ data: { couponId, userId, orderId: order.id } });
      }

      const soldAt = new Date();
      const sold = await tx.productAccount.updateMany({
        where: { id: account.id, productId, status: "reserved", reservedBy: userId, soldTo: null, soldAt: null },
        data: { status: "sold", soldTo: userId, soldAt, reservedBy: null, reservedAt: null },
      });
      if (sold.count !== 1) throw new Error("تحویل اکانت ناموفق بود");

      await tx.productAccountHistory.create({
        data: {
          accountId: account.id,
          actorId: userId,
          action: "account.deliver",
          fromValue: "reserved",
          toValue: "sold",
          metadata: JSON.stringify({ orderId: order.id, orderItemId: orderItem.id, productId, soldAt, expiresAt }),
        },
      });

      const deliveredAccount = await tx.productAccount.findUniqueOrThrow({ where: { id: account.id } });

      return { order, product, account: deliveredAccount, totalAmount, originalAmount, discountAmount, couponId, couponCode, expiresAt };
    }).then((result) => {
      AdminService.invalidateDashboardCache();
      eventBus.emit("order.created", { orderId: result.order.id, userId, productId, totalAmount: result.totalAmount });
      eventBus.emit("order.completed", { orderId: result.order.id, userId, productId, totalAmount: result.totalAmount });
      if (result.couponId && result.couponCode) eventBus.emit("coupon.applied", { couponId: result.couponId, code: result.couponCode, userId, orderId: result.order.id, discountAmount: result.discountAmount });
      return result;
    });
  }
}
