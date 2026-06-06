import { prisma } from "../../services/prisma";
import type { Prisma } from "@prisma/client";

export class CouponService {
  static async create(code: string, discountPercent: number, expiresAt: Date, maxUses = 10) {
    const normalizedCode = code.trim().toUpperCase();
    if (!normalizedCode || !Number.isInteger(discountPercent) || discountPercent <= 0 || discountPercent > 100) {
      throw new Error("اطلاعات کوپن معتبر نیست");
    }
    if (!Number.isInteger(maxUses) || maxUses <= 0) {
      throw new Error("تعداد استفاده کوپن معتبر نیست");
    }

    return prisma.coupon.create({
      data: { code: normalizedCode, discountPercent, maxUses, expiresAt },
    });
  }

  static async validateForUser(code: string, userId: string, tx: Prisma.TransactionClient = prisma) {
    const normalizedCode = code.trim().toUpperCase();
    const coupon = await tx.coupon.findUnique({ where: { code: normalizedCode } });

    if (!coupon) throw new Error("کد تخفیف پیدا نشد");
    if (coupon.expiresAt <= new Date()) throw new Error("کد تخفیف منقضی شده است");
    if (coupon.usedCount >= coupon.maxUses) throw new Error("ظرفیت استفاده از این کد به پایان رسیده است");

    const existingUsage = await tx.couponUsage.findUnique({
      where: { couponId_userId: { couponId: coupon.id, userId } },
    });
    if (existingUsage) throw new Error("شما قبلا از این کد تخفیف استفاده کرده‌اید");

    return coupon;
  }
}
