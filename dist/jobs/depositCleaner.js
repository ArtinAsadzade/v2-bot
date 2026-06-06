"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cleanExpiredDeposits = cleanExpiredDeposits;
const prisma_1 = require("../services/prisma");
const logger_1 = require("../services/logger");
const admin_service_1 = require("../modules/admin/admin.service");
let isRunning = false;
async function cleanExpiredDeposits() {
    if (isRunning) {
        logger_1.logger.warn("Deposit cleaner skipped because previous run is still active");
        return { count: 0 };
    }
    isRunning = true;
    try {
        const result = await prisma_1.prisma.deposit.updateMany({
            where: {
                status: { in: ["pending", "submitted"] },
                expiresAt: { lt: new Date() },
            },
            data: {
                status: "expired",
            },
        });
        if (result.count > 0) {
            admin_service_1.AdminService.invalidateDashboardCache();
            logger_1.logger.info("Expired deposits cleaned", { count: result.count });
        }
        return result;
    }
    finally {
        isRunning = false;
    }
}
