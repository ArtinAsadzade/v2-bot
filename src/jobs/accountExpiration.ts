import { prisma } from "../services/prisma";
import { logger } from "../services/logger";

let isRunning = false;

export async function deactivateExpiredAccounts() {
  if (isRunning) {
    logger.warn("Account expiration job skipped because previous run is still active");
    return { count: 0 };
  }

  isRunning = true;
  try {
    const result = await prisma.orderItem.updateMany({
      where: { isActive: true, expiresAt: { lte: new Date() } },
      data: { isActive: false },
    });
    if (result.count > 0) logger.info("Expired purchased accounts deactivated", { count: result.count });
    return result;
  } finally {
    isRunning = false;
  }
}
