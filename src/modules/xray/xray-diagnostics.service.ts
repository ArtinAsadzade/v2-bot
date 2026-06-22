import { prisma } from "../../services/prisma";
import { logger } from "../../services/logger";
import { XrayClientService, XrayPanelService, normalizeSubscriptionBaseUrl, sanitizePanelError, type XrayInboundOption } from "./xray.service";

export type XrayVerifyReason = "panel_offline" | "subscription_unreachable" | "client_missing" | "stale_inbounds" | "missing_sub_id" | "unknown_error";
export type XrayVerifyResult = { ok: true; reason: "ok"; client: any; panelClientId?: string; clientSubId?: string; subscriptionUrl?: string } | { ok: false; reason: XrayVerifyReason; client?: any; details?: string };

type PanelClient = { email?: string; id?: string; uuid?: string; clientId?: string; subId?: string; sub_id?: string; inboundIds?: number[]; client?: PanelClient };

function panelClientFrom(detail: any, email: string): PanelClient | undefined {
  const obj = detail?.obj;
  if (!obj) return undefined;
  const list = Array.isArray(obj) ? obj : Array.isArray(obj.clients) ? obj.clients : [obj.client ?? obj];
  return list.find((item: any) => item?.email === email || item?.client?.email === email || item?.client?.email === email) as PanelClient | undefined;
}


export class XrayDiagnosticsService {
  static async testPanelApi() {
    const result = await XrayPanelService.testConnection();
    if (result.ok) logger.info("XRAY_PANEL_API_OK", { inboundCount: result.inboundCount });
    return result;
  }

  static async testSubscriptionUrl(subId?: string) {
    const config = await XrayPanelService.getEnabledConfig();
    if (!config?.subscriptionBaseUrl) return { ok: false as const, error: "subscription_base_url_missing" };
    const base = normalizeSubscriptionBaseUrl(config.subscriptionBaseUrl)!;
    const url = subId ? `${base}/${encodeURIComponent(subId)}` : base;
    try {
      const response = await fetch(url, { method: "GET", signal: AbortSignal.timeout(8_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      logger.info("XRAY_SUBSCRIPTION_OK", { url: base });
      return { ok: true as const, url, status: response.status };
    } catch (error) {
      return { ok: false as const, url, error: sanitizePanelError(error) };
    }
  }

  static async activeDbClients() {
    return prisma.xrayClient.findMany({ where: { status: { in: ["active", "provisioning", "creating", "failed", "renewal_failed"] } }, include: { product: true, order: true } });
  }

  static async listPanelInbounds(): Promise<XrayInboundOption[]> {
    return XrayClientService.listInbounds();
  }

  static staleInboundClientIds(clients: Array<{ inboundIds: number[] }>, inbounds: XrayInboundOption[]) {
    const valid = new Set(inbounds.map((inbound) => inbound.id));
    return clients.filter((client) => client.inboundIds.some((id) => !valid.has(id)));
  }

  static async verifyXrayClient(identifier: string): Promise<XrayVerifyResult> {
    try {
      const client = await prisma.xrayClient.findFirst({
        where: { OR: [{ id: identifier }, { clientEmail: identifier }, { orderId: identifier }, { telegramId: identifier }] },
        include: { product: true, order: true },
      });
      if (!client) return { ok: false, reason: "client_missing", details: "db_client_not_found" };
      let inbounds: XrayInboundOption[];
      let detail: any;
      try {
        [inbounds, detail] = await Promise.all([XrayClientService.listInbounds(), XrayClientService.getClient(client.clientEmail)]);
      } catch (error) {
        logger.warn("XRAY_CLIENT_VERIFY_FAILED", { xrayClientId: client.id, reason: "panel_offline", error: sanitizePanelError(error) });
        return { ok: false, reason: "panel_offline", client, details: sanitizePanelError(error) };
      }
      const panelClient = panelClientFrom(detail, client.clientEmail);
      if (!panelClient) {
        logger.warn("XRAY_CLIENT_VERIFY_FAILED", { xrayClientId: client.id, reason: "client_missing" });
        return { ok: false, reason: "client_missing", client };
      }
      const validInboundIds = new Set(inbounds.map((inbound) => inbound.id));
      if (client.inboundIds.some((id) => !validInboundIds.has(id))) return { ok: false, reason: "stale_inbounds", client };
      const subId = panelClient.subId ?? panelClient.sub_id ?? panelClient.client?.subId ?? panelClient.client?.sub_id ?? client.clientSubId;
      if (!subId) return { ok: false, reason: "missing_sub_id", client };
      const subscription = await this.testSubscriptionUrl(String(subId));
      if (!subscription.ok) return { ok: false, reason: "subscription_unreachable", client, details: subscription.error };
      return { ok: true, reason: "ok", client, panelClientId: String(panelClient.uuid ?? panelClient.id ?? panelClient.clientId ?? panelClient.client?.uuid ?? panelClient.client?.id ?? ""), clientSubId: String(subId), subscriptionUrl: subscription.url };
    } catch (error) {
      logger.warn("XRAY_CLIENT_VERIFY_FAILED", { reason: "unknown_error", error: sanitizePanelError(error) });
      return { ok: false, reason: "unknown_error", details: sanitizePanelError(error) };
    }
  }

  static async repairClient(identifier: string, actorId = "admin") {
    logger.info("XRAY_CLIENT_REPAIR_STARTED", { identifier, actorId });
    const client = await prisma.xrayClient.findFirstOrThrow({ where: { OR: [{ id: identifier }, { clientEmail: identifier }, { orderId: identifier }, { telegramId: identifier }] }, include: { product: true, order: true } });
    if (!client.product?.trafficBytes || !client.product.durationDays) throw new Error("Product Xray settings are incomplete");
    const inboundIds = client.product.inboundIds;
    const valid = new Set((await XrayClientService.listInbounds()).map((inbound) => inbound.id));
    if (!inboundIds.length || inboundIds.some((id) => !valid.has(id))) throw new Error("Product inboundIds are stale");
    const exists = await XrayClientService.getClient(client.clientEmail).then((d) => Boolean(panelClientFrom(d, client.clientEmail))).catch(() => false);
    if (exists) await XrayClientService.updateClient(client.clientEmail, { totalBytes: client.trafficBytes, expiresAt: client.expiresAt, telegramId: client.telegramId, limitIp: client.product.xrayLimitIp, groupName: client.product.xrayGroupName });
    else await XrayClientService.createClient({ email: client.clientEmail, trafficBytes: client.trafficBytes, expiresAt: client.expiresAt, telegramId: client.telegramId, inboundIds, limitIp: client.product.xrayLimitIp, groupName: client.product.xrayGroupName });
    await prisma.xrayClient.update({ where: { id: client.id }, data: { inboundIds, status: "provisioning", lastError: null } });
    const verified = await this.verifyXrayClient(client.id);
    if (!verified.ok) return { ok: false as const, verified };
    const updated = await prisma.$transaction(async (tx) => {
      const xrayClient = await tx.xrayClient.update({ where: { id: client.id }, data: { status: "active", panelClientId: verified.panelClientId, clientSubId: verified.clientSubId, lastError: null } });
      const updatedItems = await tx.orderItem.updateMany({ where: { xrayClientId: client.id }, data: { isActive: true, expiresAt: client.expiresAt } });
      if (updatedItems.count === 0 && client.orderId && client.productId) {
        await tx.orderItem.create({
          data: {
            orderId: client.orderId,
            productId: client.productId,
            xrayClientId: client.id,
            deliveredUsername: client.clientEmail,
            deliveredSubscriptionLink: verified.subscriptionUrl ?? null,
            deliveredConfigLink: null,
            deliveredConfig: "XRAY_LIVE_LINKS",
            purchaseDate: new Date(),
            expiresAt: client.expiresAt,
            isActive: true,
          },
        });
      }
      if (client.orderId) await tx.order.update({ where: { id: client.orderId }, data: { status: "completed" } }).catch(() => undefined as any);
      return xrayClient;
    });
    logger.info("XRAY_CLIENT_REPAIR_SUCCESS", { xrayClientId: client.id, actorId });
    return { ok: true as const, client: updated, verified };
  }

  static async cleanupBrokenClients(actorId = "admin") {
    const clients = await this.activeDbClients();
    const inbounds = await XrayClientService.listInbounds().catch(() => []);
    let missing = 0, stale = 0, deactivatedItems = 0;
    for (const client of clients) {
      const verify = await this.verifyXrayClient(client.id);
      if (verify.ok) continue;
      if (verify.reason === "client_missing") missing++;
      if (verify.reason === "stale_inbounds") stale++;
      if (verify.reason === "client_missing") {
        await prisma.xrayClient.update({ where: { id: client.id }, data: { lastError: "client_missing_pending_admin_review" } });
        continue;
      }
      if (verify.reason === "stale_inbounds") {
        await prisma.xrayClient.update({ where: { id: client.id }, data: { status: "deleted", lastError: verify.reason } });
        const items = await prisma.orderItem.updateMany({ where: { xrayClientId: client.id }, data: { isActive: false } });
        deactivatedItems += items.count;
      }
    }
    const report = { scanned: clients.length, inboundCount: inbounds.length, missing, stale, deactivatedItems };
    logger.info("XRAY_CLEANUP_COMPLETED", { ...report, actorId });
    return report;
  }

  static async syncReport() {
    logger.info("XRAY_DIAGNOSTICS_STARTED", {});
    const panel = await this.testPanelApi();
    const inbounds = panel.ok ? await this.listPanelInbounds().catch(() => []) : [];
    const clients = await this.activeDbClients();
    const staleInboundClients = this.staleInboundClientIds(clients, inbounds);
    const verified = await Promise.all(clients.map((client) => this.verifyXrayClient(client.id)));
    return {
      panelApiOk: panel.ok,
      inboundCount: inbounds.length,
      activeDbClients: clients.length,
      missingOnPanel: verified.filter((r) => !r.ok && r.reason === "client_missing").length,
      staleInboundClients: staleInboundClients.length,
      brokenSubscriptions: verified.filter((r) => !r.ok && r.reason === "subscription_unreachable").length,
      orphanPanelClients: 0,
    };
  }
}
