import { prisma } from "../../services/prisma";
import { logger } from "../../services/logger";

export type XrayInboundOption = { id: number; port?: number; protocol?: string; remark?: string; tag?: string; nodeId?: number | string; enable?: boolean; enabled?: boolean };
const XRAY_TIMEOUT_MS = 10_000;
export const XRAY_GB = 1024n * 1024n * 1024n;
export function gbToBytes(gb: number) { return BigInt(gb) * XRAY_GB; }
export function maskToken(token?: string | null) { return token ? `${"*".repeat(Math.max(token.length - 4, 8))}${token.slice(-4)}` : "—"; }
export function sanitizePanelError(error: unknown) { return error instanceof Error ? error.message.replace(/Bearer\s+\S+/gi, "Bearer ********") : String(error); }
export function xrayInboundSnapshot(inbounds: XrayInboundOption[], selectedIds: number[]) {
  const selected = new Set(selectedIds);
  return JSON.stringify(inbounds.filter((inbound) => selected.has(inbound.id)).map(({ id, remark, protocol, port, tag, nodeId }) => ({ id, remark, protocol, port, tag, nodeId })));
}
export function formatXrayBytes(value?: bigint | number | string | null, options: { unlimitedIfZero?: boolean; maximumFractionDigits?: number } = {}) {
  const bytes = typeof value === "bigint" ? Number(value) : Number(value ?? 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return options.unlimitedIfZero ? "نامحدود" : "0 GB";
  const gb = bytes / (1024 ** 3);
  return `${gb.toLocaleString("fa-IR", { maximumFractionDigits: options.maximumFractionDigits ?? 2 })} GB`;
}
export function normalizeXrayStatus(status?: string | null) { return ({ active: "فعال ✅", creating: "در حال آماده‌سازی ⏳", provisioning: "در حال آماده‌سازی ⏳", failed: "نیازمند بررسی ⚠️", renewal_failed: "نیازمند بررسی ⚠️", expired: "منقضی شده ⛔", disabled: "غیرفعال 🚫" } as Record<string, string>)[String(status ?? "")] ?? "نامشخص"; }
export function xrayTrafficSnapshot(traffic: any, fallbackTotal: bigint, fallbackUsed: bigint = 0n) {
  const up = BigInt(Math.max(0, Number(traffic?.up ?? 0)));
  const down = BigInt(Math.max(0, Number(traffic?.down ?? 0)));
  const usedBytes = traffic ? up + down : fallbackUsed;
  const totalBytes = traffic && traffic.total !== undefined && traffic.total !== null ? BigInt(Math.max(0, Number(traffic.total))) : fallbackTotal;
  return { usedBytes, totalBytes, remainingBytes: totalBytes > 0n ? (totalBytes > usedBytes ? totalBytes - usedBytes : 0n) : 0n };
}
export function normalizeBaseUrl(url: string) {
  try { const parsed = new URL(url.trim()); if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("protocol"); parsed.hash = ""; parsed.search = ""; parsed.pathname = parsed.pathname.replace(/\/panel\/api(?:\/.*)?$/i, "").replace(/\/+$/, ""); return parsed.toString().replace(/\/+$/, ""); }
  catch { throw new Error("آدرس پنل معتبر نیست. نمونه صحیح:\nhttps://domain.com:port/securityPath"); }
}
export function normalizeSubscriptionBaseUrl(url?: string | null) { if (!url?.trim()) return undefined; try { const parsed = new URL(url.trim()); if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("protocol"); return parsed.toString().replace(/\/+$/, ""); } catch { throw new Error("لینک اشتراک معتبر نیست. نمونه صحیح: https://domain.com:port/sub"); } }
export type XrayPanelConfigPatch = { apiBaseUrl?: string; apiToken?: string; subscriptionBaseUrl?: string | null; enabled?: boolean };
export function mergeXrayConfigPatch(existing: { apiBaseUrl?: string | null; apiToken?: string | null; subscriptionBaseUrl?: string | null; enabled?: boolean | null } | null, patch: XrayPanelConfigPatch) {
  if (patch.apiToken !== undefined && !patch.apiToken.trim()) throw new Error("توکن API نمی‌تواند خالی باشد.");
  const merged = { apiBaseUrl: existing?.apiBaseUrl ?? "", apiToken: existing?.apiToken ?? "", subscriptionBaseUrl: existing?.subscriptionBaseUrl ?? undefined, enabled: existing?.enabled ?? true, ...patch };
  if (!merged.apiBaseUrl?.trim() || !merged.apiToken?.trim()) throw new Error("برای ساخت تنظیمات اولیه، وارد کردن apiBaseUrl و apiToken الزامی است.");
  return { ...merged, apiBaseUrl: normalizeBaseUrl(merged.apiBaseUrl), apiToken: merged.apiToken.trim(), subscriptionBaseUrl: normalizeSubscriptionBaseUrl(merged.subscriptionBaseUrl), enabled: Boolean(merged.enabled) };
}
async function request<T>(path: string, init: RequestInit = {}, config?: { apiBaseUrl: string; apiToken: string }): Promise<T> { const panel = config ?? await XrayPanelService.getEnabledConfig(); if (!panel) throw new Error("اتصال پنل Xray فعال نیست"); const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), XRAY_TIMEOUT_MS); try { const response = await fetch(`${normalizeBaseUrl(panel.apiBaseUrl)}${path}`, { ...init, signal: controller.signal, headers: { "Content-Type": "application/json", Authorization: `Bearer ${panel.apiToken}`, ...(init.headers ?? {}) } }); const text = await response.text(); const json = text ? JSON.parse(text) : {}; if (!response.ok) { if (response.status === 401 || response.status === 403) throw new Error("توکن API معتبر نیست یا دسترسی کافی ندارد."); throw new Error(`HTTP ${response.status}`); } if (json.success === false) throw new Error(json.msg || json.message || `HTTP ${response.status}`); return json as T; } catch (error) { if (error instanceof Error && (error.message.startsWith("آدرس پنل") || error.message.includes("توکن API") || error.message.startsWith("HTTP"))) throw error; throw new Error("اتصال به پنل برقرار نشد. آدرس پنل و پورت را بررسی کنید."); } finally { clearTimeout(timeout); } }
export class XrayPanelService { static async getEnabledConfig() { return prisma.xrayPanelConfig.findFirst({ where: { enabled: true }, orderBy: { updatedAt: "desc" } }); } static async upsertConfig(data: { apiBaseUrl: string; apiToken: string; subscriptionBaseUrl?: string; enabled?: boolean }) { return this.upsertConfigPatch(data); } static async upsertConfigPatch(patch: XrayPanelConfigPatch) { const existing = await prisma.xrayPanelConfig.findFirst({ where: { name: "default" } }); const payload = mergeXrayConfigPatch(existing, patch); return existing ? prisma.xrayPanelConfig.update({ where: { id: existing.id }, data: payload }) : prisma.xrayPanelConfig.create({ data: { name: "default", ...payload } }); } static async testConnection() { const config = await this.getEnabledConfig(); if (!config) throw new Error("تنظیمات فعال پنل پیدا نشد"); try { const inbounds = await XrayClientService.listInbounds(config); await prisma.xrayPanelConfig.update({ where: { id: config.id }, data: { lastSuccessAt: new Date(), lastError: null, lastInboundCount: inbounds.length } }); logger.info("XRAY_PANEL_TEST_SUCCESS", { inboundCount: inbounds.length }); return { ok: true, inboundCount: inbounds.length }; } catch (error) { const message = sanitizePanelError(error); await prisma.xrayPanelConfig.update({ where: { id: config.id }, data: { lastError: message } }); logger.error("XRAY_PANEL_TEST_FAILED", { error: message }); return { ok: false, error: message, inboundCount: 0 }; } } }
export class XrayClientService {
 static async listInbounds(config?: { apiBaseUrl: string; apiToken: string }) { const res = await request<{ obj?: XrayInboundOption[] }>("/panel/api/inbounds/options", {}, config); const inbounds = (res.obj ?? []).filter((inbound) => inbound.enabled !== false && inbound.enable !== false); logger.info("XRAY_INBOUNDS_FETCHED", { count: inbounds.length }); return inbounds; }
 static async createClient(input: { email: string; trafficBytes: bigint; expiresAt: Date; telegramId: string | number; inboundIds: number[] }) { logger.info("XRAY_CLIENT_CREATE_REQUEST", { email: input.email, inboundIds: input.inboundIds }); const res = await request<{ obj?: { id?: string; uuid?: string; subId?: string } }>("/panel/api/clients/add", { method: "POST", body: JSON.stringify({ client: { email: input.email, totalGB: Number(input.trafficBytes), expiryTime: input.expiresAt.getTime(), tgId: Number(input.telegramId), limitIp: 0, enable: true }, inboundIds: input.inboundIds }) }); logger.info("XRAY_CLIENT_CREATED", { email: input.email }); return res.obj ?? {}; }
 static async updateClient(email: string, input: { totalBytes: bigint; expiresAt: Date; telegramId: string | number }) { logger.info("XRAY_CLIENT_RENEW_REQUEST", { email }); try { const res = await request<{ obj?: unknown }>(`/panel/api/clients/update/${encodeURIComponent(email)}`, { method: "POST", body: JSON.stringify({ email, totalGB: Number(input.totalBytes), expiryTime: input.expiresAt.getTime(), tgId: Number(input.telegramId), enable: true }) }); logger.info("XRAY_CLIENT_RENEW_SUCCESS", { email }); return res.obj; } catch (error) { logger.error("XRAY_CLIENT_RENEW_FAILED", { email, error: sanitizePanelError(error) }); throw error; } }
 static getClient(email: string) { return request<{ obj?: any }>(`/panel/api/clients/get/${encodeURIComponent(email)}`); }
 static links(email: string) { return request<{ obj?: any }>(`/panel/api/clients/links/${encodeURIComponent(email)}`).then((r) => r.obj); }
 static traffic(email: string) { return request<{ obj?: any }>(`/panel/api/clients/traffic/${encodeURIComponent(email)}`).then((r) => r.obj); }
 static subLinks(subId: string) { return request<{ obj?: any }>(`/panel/api/clients/subLinks/${encodeURIComponent(subId)}`).then((r) => r.obj); }
 static async subscriptionUrl(client: { id: string; clientEmail: string; clientSubId?: string | null }) { const config = await XrayPanelService.getEnabledConfig(); let subId = client.clientSubId ?? undefined; if (!subId) { const detail = await this.getClient(client.clientEmail).catch(() => null); subId = detail?.obj?.subId ?? detail?.obj?.client?.subId ?? detail?.obj?.sub_id; if (subId) await prisma.xrayClient.update({ where: { id: client.id }, data: { clientSubId: String(subId) } }); }
   if (!subId) throw new Error("شناسه اشتراک برای این سرویس هنوز از پنل دریافت نشده است.");
   if (!config?.subscriptionBaseUrl) throw new Error("لینک پایه اشتراک در تنظیمات Xray ثبت نشده است.");
   return `${normalizeSubscriptionBaseUrl(config.subscriptionBaseUrl)}/${encodeURIComponent(String(subId))}`;
 }
}
