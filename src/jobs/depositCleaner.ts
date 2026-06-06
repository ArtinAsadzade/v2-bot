import { prisma } from "../services/prisma";
import { logger } from "../services/logger";
import { AdminService } from "../modules/admin/admin.service";

let isRunning = false;

export async function cleanExpiredDeposits() {
  if (isRunning) {
    logger.warn("Deposit cleaner skipped because previous run is still active");
    return { count: 0 };
  }

  isRunning = true;
  try {
    const result = await prisma.deposit.updateMany({
      where: {
        status: { in: ["pending", "submitted"] },
        expiresAt: { lt: new Date() },
      },
      data: {
        status: "expired",
      },
    });

    if (result.count > 0) {
      AdminService.invalidateDashboardCache();
      logger.info("Expired deposits cleaned", { count: result.count });
    }

    return result;
  } finally {
    isRunning = false;
  }
}
