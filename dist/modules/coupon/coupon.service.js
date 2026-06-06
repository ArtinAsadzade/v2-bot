"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CouponService = void 0;
const prisma_1 = require("../../services/prisma");
class CouponService {
    static async create(code, discount, expiresAt) {
        return prisma_1.prisma.coupon.create({
            data: {
                code,
                discount,
                maxUses: 10,
                expiresAt,
            },
        });
    }
}
exports.CouponService = CouponService;
