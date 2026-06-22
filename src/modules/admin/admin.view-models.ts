import { prisma } from "../../services/prisma";
import { formatXrayBytes } from "../xray/xray.service";
import { productNotDeletedWhere } from "../product/visibility";

export function xrayAdminStatusLabel(status?: string | null) {
  const labels: Record<string, string> = {
    active: "✅ فعال",
    provisioning: "⏳ در حال ساخت",
    creating: "⏳ در حال ساخت",
    failed: "❌ ناموفق",
    renewal_failed: "❌ ناموفق",
    expired: "🕒 منقضی‌شده",
    missing_on_panel: "⚠️ نیازمند بررسی",
    deleted: "🗑 حذف‌شده",
  };
  return status ? labels[status] ?? status : "همه";
}

export function maskAdminSecret(secret?: string | null) {
  if (!secret) return "ثبت نشده";
  if (secret.length <= 8) return "••••";
  return `${secret.slice(0, 3)}••••${secret.slice(-3)}`;
}

export async function xrayCenterViewModel() {
  const now = new Date();
  const soon = new Date(Date.now() + 3 * 86_400_000);
  const [panels, active, expired, provisioning, failed, review, traffic, syncErrors, buildErrors, expiringSoon] = await Promise.all([
    prisma.xrayPanelConfig.findMany({ orderBy: { updatedAt: "desc" } }),
    prisma.xrayClient.count({ where: { status: "active", expiresAt: { gt: now } } }),
    prisma.xrayClient.count({ where: { OR: [{ status: "expired" }, { expiresAt: { lte: now } }] } }),
    prisma.xrayClient.count({ where: { status: { in: ["provisioning", "creating"] as any } } }),
    prisma.xrayClient.count({ where: { status: { in: ["failed", "renewal_failed"] as any } } }),
    prisma.xrayClient.count({ where: { status: "missing_on_panel" as any } }),
    prisma.xrayClient.aggregate({ _sum: { usedBytes: true, trafficBytes: true } }),
    prisma.xrayClient.count({ where: { status: "missing_on_panel" as any } }),
    prisma.xrayClient.count({ where: { status: { in: ["failed", "renewal_failed"] as any } } }),
    prisma.xrayClient.count({ where: { status: "active", expiresAt: { gt: now, lte: soon } } }),
  ]);
  const enabledPanels = panels.filter((panel) => panel.enabled);
  const lastCheck = panels.find((panel) => panel.lastSuccessAt)?.lastSuccessAt ?? panels[0]?.updatedAt;
  const recentErrors = panels.map((panel) => panel.lastError).filter(Boolean).slice(0, 3) as string[];
  const used = traffic._sum.usedBytes ?? 0n;
  const total = traffic._sum.trafficBytes ?? 0n;
  const remaining = total > used ? total - used : 0n;
  return {
    connectionLabel: enabledPanels.some((panel) => panel.lastSuccessAt && !panel.lastError) ? "✅ متصل" : enabledPanels.length ? "⚠️ نیازمند بررسی" : "⛔ غیرفعال",
    panelCount: panels.length,
    enabledPanelCount: enabledPanels.length,
    lastCheck,
    recentErrors,
    clients: { active, expired, provisioning, failed, review },
    capacity: {
      used: formatXrayBytes(used),
      total: formatXrayBytes(total, { unlimitedIfZero: true }),
      remaining: formatXrayBytes(remaining, { unlimitedIfZero: true }),
      expiringSoon,
    },
    errors: { buildErrors, syncErrors, review },
  };
}

export async function adminShopViewModel() {
  const [totalProducts, activeProducts, inactiveProducts, categories, lowStockProducts, xrayConnectedProducts] = await Promise.all([
    prisma.product.count({ where: productNotDeletedWhere() }),
    prisma.product.count({ where: { isActive: true, AND: [productNotDeletedWhere()] } }),
    prisma.product.count({ where: { isActive: false, AND: [productNotDeletedWhere()] } }),
    prisma.category.count({ where: { deletedAt: null } }),
    prisma.product.count({ where: { deletedAt: null, OR: [{ mode: { not: "xray_auto" }, accounts: { none: { status: "available" } } }, { mode: "xray_auto", stockLimit: { lte: 5 } }] } }),
    prisma.product.count({ where: { mode: "xray_auto", deletedAt: null, OR: [{ inboundIds: { isEmpty: false } }, { xrayPanelConfigId: { not: null } }] } }),
  ]);
  return { totalProducts, activeProducts, inactiveProducts, categories, lowStockProducts, xrayConnectedProducts };
}
