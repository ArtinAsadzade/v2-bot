import { prisma } from "../services/prisma";
import { logger } from "../services/logger";
import { AdminService } from "../modules/admin/admin.service";
import { PaymentService } from "../modules/payment/payment.service";

function envSeconds(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

let isRunning = false;

export async function cleanStalePurchases() {
  if (isRunning) {
    logger.warn("Purchase cleaner skipped because previous run is still active");
    return { invoices: 0, orders: 0, reservations: 0 };
  }
  isRunning = true;
  try {
    const invoiceCutoff = new Date(Date.now() - envSeconds("INVOICE_PENDING_TTL_SECONDS", 30 * 60) * 1000);
    const purchaseCutoff = new Date(Date.now() - envSeconds("PURCHASE_PENDING_TTL_SECONDS", 15 * 60) * 1000);

    const expiredInvoices = await prisma.paymentInvoice.updateMany({
      where: { type: "PRODUCT_PURCHASE", status: "PENDING", createdAt: { lt: invoiceCutoff } },
      data: { status: "EXPIRED", deliveryStatus: "EXPIRED" },
    });

    const staleOrders = await prisma.order.findMany({
      where: { status: { in: ["pending", "reserving", "panel_creating", "panel_verified"] }, createdAt: { lt: purchaseCutoff } },
      include: { xrayClients: true },
      take: 100,
    });

    for (const order of staleOrders) {
      const hasPanelWork = order.xrayClients.some((client) => client.status === "creating" || client.status === "active" || client.panelClientId);
      await prisma.order.update({ where: { id: order.id }, data: { status: hasPanelWork ? "failed_delivery" : "cancelled" } });
      await prisma.xrayClient.updateMany({ where: { orderId: order.id, status: { in: ["provisioning", "creating"] } }, data: { status: hasPanelWork ? "orphaned_panel_client" : "failed", lastError: hasPanelWork ? "stale_purchase_orphaned_panel_client" : "stale_purchase_expired" } });
      await prisma.auditLog.create({ data: { actorId: "system", action: hasPanelWork ? "purchase.delivery_requires_admin" : "purchase.expired", metadata: JSON.stringify({ orderId: order.id, productId: order.productId }) } });
    }

    const reservations = await PaymentService.releaseExpiredReservations(Math.ceil(envSeconds("PURCHASE_PENDING_TTL_SECONDS", 15 * 60) / 60));
    if (expiredInvoices.count || staleOrders.length || reservations) {
      AdminService.invalidateDashboardCache();
      logger.info("Stale purchases cleaned", { invoices: expiredInvoices.count, orders: staleOrders.length, reservations });
    }
    return { invoices: expiredInvoices.count, orders: staleOrders.length, reservations };
  } finally {
    isRunning = false;
  }
}
