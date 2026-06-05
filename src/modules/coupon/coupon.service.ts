import { prisma } from "../../services/prisma";

export class CouponService {
  static async create(code: string, discount: number, expiresAt: Date) {
    return prisma.coupon.create({
      data: {
        code,
        discount,
        maxUses: 10,
        expiresAt,
      },
    });
  }
}
