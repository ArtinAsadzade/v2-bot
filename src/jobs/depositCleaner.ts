import { prisma } from "../services/prisma";

export async function cleanExpiredDeposits() {
  return prisma.deposit.updateMany({
    where: {
      status: "pending",
      expiresAt: { lt: new Date() },
    },
    data: {
      status: "expired",
    },
  });
}
