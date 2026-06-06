"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivateExpiredAccounts = deactivateExpiredAccounts;
const prisma_1 = require("../services/prisma");
const logger_1 = require("../services/logger");
let isRunning = false;
async function deactivateExpiredAccounts() {
    if (isRunning) {
        logger_1.logger.warn("Account expiration job skipped because previous run is still active");
        return { count: 0 };
    }
    isRunning = true;
    try {
        const result = await prisma_1.prisma.orderItem.updateMany({
            where: { isActive: true, expiresAt: { lte: new Date() } },
            data: { isActive: false },
        });
        if (result.count > 0)
            logger_1.logger.info("Expired purchased accounts deactivated", { count: result.count });
        return result;
    }
    finally {
        isRunning = false;
    }
}
