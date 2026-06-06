"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cleanExpiredDeposits = cleanExpiredDeposits;
const prisma_1 = require("../services/prisma");
async function cleanExpiredDeposits() {
    return prisma_1.prisma.deposit.updateMany({
        where: {
            status: "pending",
            expiresAt: { lt: new Date() },
        },
        data: {
            status: "expired",
        },
    });
}
