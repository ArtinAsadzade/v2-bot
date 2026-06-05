import { prisma } from "../services/prisma";

export async function cleanExpiredDeposits() {
  const now = new Date();

  await prisma.deposit.updateMany({
    where: {
      status: "pending",
      expiresAt: { lt: now },
    },
    data: {
      status: "rejected",
    },
  });
}
