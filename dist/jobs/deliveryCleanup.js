"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cleanupExpiredDeliveryReservations = cleanupExpiredDeliveryReservations;
const prisma_1 = require("../services/prisma");
const logger_1 = require("../services/logger");
async function cleanupExpiredDeliveryReservations(now = new Date()) {
    const [productAccounts, freeAccounts, orders] = await prisma_1.prisma.$transaction([
        prisma_1.prisma.productAccount.updateMany({ where: { status: "reserved", reservationExpiresAt: { lt: now }, soldTo: null, soldAt: null }, data: { status: "available", reservedBy: null, reservedAt: null, reservationExpiresAt: null } }),
        prisma_1.prisma.freeAccount.updateMany({ where: { status: "reserved", reservationExpiresAt: { lt: now }, assignedTo: null, assignedAt: null }, data: { status: "available", reservedBy: null, reservedAt: null, reservationExpiresAt: null } }),
        prisma_1.prisma.order.updateMany({ where: { status: { in: ["pending", "reserving", "panel_creating"] }, createdAt: { lt: new Date(now.getTime() - 30 * 60000) } }, data: { status: "failed" } }),
    ]);
    const summary = { productReservationsReleased: productAccounts.count, freeReservationsReleased: freeAccounts.count, staleOrdersFailed: orders.count };
    logger_1.logger.info("DELIVERY_RESERVATION_CLEANUP", summary);
    if (productAccounts.count || freeAccounts.count || orders.count)
        await prisma_1.prisma.auditLog.create({ data: { actorId: "system", action: "delivery.cleanup", metadata: JSON.stringify(summary) } });
    return summary;
}
