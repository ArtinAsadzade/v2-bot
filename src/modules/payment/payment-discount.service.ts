import { type TxClient } from "./payment.types";
import { audit } from "./payment-repository";

export class PaymentDiscountService {
  static async confirmCouponUsage(
    tx: TxClient,
    data: {
      couponId: string;
      userId: string;
      orderId: string;
      invoiceId?: string;
      originalAmount: number;
      discountAmount: number;
      finalAmount: number;
    },
  ) {
    const existingForOrder = await tx.couponUsage.findFirst({ where: { couponId: data.couponId, orderId: data.orderId } });
    if (existingForOrder) return existingForOrder;
    const coupon = await tx.coupon.findUniqueOrThrow({
      where: { id: data.couponId },
      select: { maxUses: true, perUserLimit: true, status: true, deletedAt: true, expiresAt: true },
    });
    const userUsageCount = await tx.couponUsage.count({ where: { couponId: data.couponId, userId: data.userId } });
    if (userUsageCount >= coupon.perUserLimit) {
      await audit(tx, {
        userId: data.userId,
        invoiceId: data.invoiceId,
        action: "COUPON_USAGE_RACE_BLOCKED",
        metadata: { couponId: data.couponId, reason: "per_user_limit" },
      });
      throw new Error("سقف استفاده شما از این کد تخفیف تکمیل شده است");
    }
    const couponUpdated = await tx.coupon.updateMany({
      where: { id: data.couponId, status: "active", deletedAt: null, usedCount: { lt: coupon.maxUses }, expiresAt: { gt: new Date() } },
      data: { usedCount: { increment: 1 } },
    });
    if (couponUpdated.count !== 1) {
      await audit(tx, {
        userId: data.userId,
        invoiceId: data.invoiceId,
        action: "COUPON_USAGE_RACE_BLOCKED",
        metadata: { couponId: data.couponId, reason: "global_limit_or_expired" },
      });
      throw new Error("کد تخفیف دیگر قابل استفاده نیست");
    }
    const usage = await tx.couponUsage.create({
      data: { couponId: data.couponId, userId: data.userId, orderId: data.orderId, usageSlot: userUsageCount },
    });
    await audit(tx, {
      userId: data.userId,
      invoiceId: data.invoiceId,
      action: "COUPON_USAGE_RECORDED",
      metadata: {
        couponId: data.couponId,
        orderId: data.orderId,
        usageSlot: userUsageCount,
        originalAmount: data.originalAmount,
        discountAmount: data.discountAmount,
        finalAmount: data.finalAmount,
      },
    });
    return usage;
  }

}
