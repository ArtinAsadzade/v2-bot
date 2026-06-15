import { prisma } from "../services/prisma";
import { logger } from "../services/logger";

export async function cleanupExpiredDeliveryReservations(now = new Date()) {
  const [productAccounts, freeAccounts, orders] = await prisma.$transaction([
    prisma.productAccount.updateMany({ where: { status: "reserved", reservationExpiresAt: { lt: now }, soldTo: null, soldAt: null }, data: { status: "available", reservedBy: null, reservedAt: null, reservationExpiresAt: null } }),
    prisma.freeAccount.updateMany({ where: { status: "reserved", reservationExpiresAt: { lt: now }, assignedTo: null, assignedAt: null }, data: { status: "available", reservedBy: null, reservedAt: null, reservationExpiresAt: null } }),
    prisma.order.updateMany({ where: { status: { in: ["pending", "reserving", "panel_creating"] }, createdAt: { lt: new Date(now.getTime() - 30 * 60_000) } }, data: { status: "failed" } }),
  ]);
  const summary = { productReservationsReleased: productAccounts.count, freeReservationsReleased: freeAccounts.count, staleOrdersFailed: orders.count };
  logger.info("DELIVERY_RESERVATION_CLEANUP", summary);
  if (productAccounts.count || freeAccounts.count || orders.count) await prisma.auditLog.create({ data: { actorId: "system", action: "delivery.cleanup", metadata: JSON.stringify(summary) } });
  return summary;
}
