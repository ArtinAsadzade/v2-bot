"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.XrayClientService = exports.XrayPanelService = void 0;
exports.gbToBytes = gbToBytes;
exports.maskToken = maskToken;
exports.sanitizePanelError = sanitizePanelError;
exports.xrayInboundSnapshot = xrayInboundSnapshot;
exports.formatXrayBytes = formatXrayBytes;
exports.normalizeBaseUrl = normalizeBaseUrl;
exports.normalizeSubscriptionBaseUrl = normalizeSubscriptionBaseUrl;
exports.mergeXrayConfigPatch = mergeXrayConfigPatch;
const prisma_1 = require("../../services/prisma");
const logger_1 = require("../../services/logger");
const XRAY_TIMEOUT_MS = 10000;
const GB = 1024n * 1024n * 1024n;
function gbToBytes(gb) { return BigInt(gb) * GB; }
function maskToken(token) { return token ? `${"*".repeat(Math.max(token.length - 4, 8))}${token.slice(-4)}` : "—"; }
function sanitizePanelError(error) { return error instanceof Error ? error.message.replace(/Bearer\s+\S+/gi, "Bearer ********") : String(error); }
function xrayInboundSnapshot(inbounds, selectedIds) {
    const selected = new Set(selectedIds);
    return JSON.stringify(inbounds.filter((inbound) => selected.has(inbound.id)).map(({ id, remark, protocol, port, tag, nodeId }) => ({ id, remark, protocol, port, tag, nodeId })));
}
function formatXrayBytes(value) {
    const bytes = typeof value === "bigint" ? Number(value) : Number(value ?? 0);
    if (!Number.isFinite(bytes) || bytes <= 0)
        return "0 GB";
    return `${(bytes / (1024 ** 3)).toFixed(2)} GB`;
}
function normalizeBaseUrl(url) {
    try {
        const parsed = new URL(url.trim());
        if (!["http:", "https:"].includes(parsed.protocol))
            throw new Error("protocol");
        parsed.hash = "";
        parsed.search = "";
        parsed.pathname = parsed.pathname.replace(/\/panel\/api(?:\/.*)?$/i, "").replace(/\/+$/, "");
        return parsed.toString().replace(/\/+$/, "");
    }
    catch {
        throw new Error("آدرس پنل معتبر نیست. نمونه صحیح:\nhttps://domain.com:port/securityPath");
    }
}
function normalizeSubscriptionBaseUrl(url) { if (!url?.trim())
    return undefined; try {
    const parsed = new URL(url.trim());
    if (!["http:", "https:"].includes(parsed.protocol))
        throw new Error("protocol");
    return parsed.toString().replace(/\/+$/, "");
}
catch {
    throw new Error("لینک اشتراک معتبر نیست. نمونه صحیح: https://domain.com:port/sub");
} }
function mergeXrayConfigPatch(existing, patch) {
    if (patch.apiToken !== undefined && !patch.apiToken.trim())
        throw new Error("توکن API نمی‌تواند خالی باشد.");
    const merged = { apiBaseUrl: existing?.apiBaseUrl ?? "", apiToken: existing?.apiToken ?? "", subscriptionBaseUrl: existing?.subscriptionBaseUrl ?? undefined, enabled: existing?.enabled ?? true, ...patch };
    if (!merged.apiBaseUrl?.trim() || !merged.apiToken?.trim())
        throw new Error("برای ساخت تنظیمات اولیه، وارد کردن apiBaseUrl و apiToken الزامی است.");
    return { ...merged, apiBaseUrl: normalizeBaseUrl(merged.apiBaseUrl), apiToken: merged.apiToken.trim(), subscriptionBaseUrl: normalizeSubscriptionBaseUrl(merged.subscriptionBaseUrl), enabled: Boolean(merged.enabled) };
}
async function request(path, init = {}, config) { const panel = config ?? await XrayPanelService.getEnabledConfig(); if (!panel)
    throw new Error("اتصال پنل Xray فعال نیست"); const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), XRAY_TIMEOUT_MS); try {
    const response = await fetch(`${normalizeBaseUrl(panel.apiBaseUrl)}${path}`, { ...init, signal: controller.signal, headers: { "Content-Type": "application/json", Authorization: `Bearer ${panel.apiToken}`, ...(init.headers ?? {}) } });
    const text = await response.text();
    const json = text ? JSON.parse(text) : {};
    if (!response.ok) {
        if (response.status === 401 || response.status === 403)
            throw new Error("توکن API معتبر نیست یا دسترسی کافی ندارد.");
        throw new Error(`HTTP ${response.status}`);
    }
    if (json.success === false)
        throw new Error(json.msg || json.message || `HTTP ${response.status}`);
    return json;
}
catch (error) {
    if (error instanceof Error && (error.message.startsWith("آدرس پنل") || error.message.includes("توکن API") || error.message.startsWith("HTTP")))
        throw error;
    throw new Error("اتصال به پنل برقرار نشد. آدرس پنل و پورت را بررسی کنید.");
}
finally {
    clearTimeout(timeout);
} }
class XrayPanelService {
    static async getEnabledConfig() { return prisma_1.prisma.xrayPanelConfig.findFirst({ where: { enabled: true }, orderBy: { updatedAt: "desc" } }); }
    static async upsertConfig(data) { return this.upsertConfigPatch(data); }
    static async upsertConfigPatch(patch) { const existing = await prisma_1.prisma.xrayPanelConfig.findFirst({ where: { name: "default" } }); const payload = mergeXrayConfigPatch(existing, patch); return existing ? prisma_1.prisma.xrayPanelConfig.update({ where: { id: existing.id }, data: payload }) : prisma_1.prisma.xrayPanelConfig.create({ data: { name: "default", ...payload } }); }
    static async testConnection() { const config = await this.getEnabledConfig(); if (!config)
        throw new Error("تنظیمات فعال پنل پیدا نشد"); try {
        const inbounds = await XrayClientService.listInbounds(config);
        await prisma_1.prisma.xrayPanelConfig.update({ where: { id: config.id }, data: { lastSuccessAt: new Date(), lastError: null, lastInboundCount: inbounds.length } });
        logger_1.logger.info("XRAY_PANEL_TEST_SUCCESS", { inboundCount: inbounds.length });
        return { ok: true, inboundCount: inbounds.length };
    }
    catch (error) {
        const message = sanitizePanelError(error);
        await prisma_1.prisma.xrayPanelConfig.update({ where: { id: config.id }, data: { lastError: message } });
        logger_1.logger.error("XRAY_PANEL_TEST_FAILED", { error: message });
        return { ok: false, error: message, inboundCount: 0 };
    } }
}
exports.XrayPanelService = XrayPanelService;
class XrayClientService {
    static async listInbounds(config) { const res = await request("/panel/api/inbounds/options", {}, config); const inbounds = (res.obj ?? []).filter((inbound) => inbound.enabled !== false && inbound.enable !== false); logger_1.logger.info("XRAY_INBOUNDS_FETCHED", { count: inbounds.length }); return inbounds; }
    static async createClient(input) { logger_1.logger.info("XRAY_CLIENT_CREATE_REQUEST", { email: input.email, inboundIds: input.inboundIds }); const res = await request("/panel/api/clients/add", { method: "POST", body: JSON.stringify({ client: { email: input.email, totalGB: Number(input.trafficBytes) / Number(GB), expiryTime: input.expiresAt.getTime(), tgId: Number(input.telegramId), limitIp: 0, enable: true }, inboundIds: input.inboundIds }) }); logger_1.logger.info("XRAY_CLIENT_CREATED", { email: input.email }); return res.obj ?? {}; }
    static async updateClient(email, input) { logger_1.logger.info("XRAY_CLIENT_RENEW_REQUEST", { email }); try {
        const res = await request(`/panel/api/clients/update/${encodeURIComponent(email)}`, { method: "POST", body: JSON.stringify({ email, totalGB: Number(input.totalBytes) / Number(GB), expiryTime: input.expiresAt.getTime(), tgId: Number(input.telegramId), enable: true }) });
        logger_1.logger.info("XRAY_CLIENT_RENEW_SUCCESS", { email });
        return res.obj;
    }
    catch (error) {
        logger_1.logger.error("XRAY_CLIENT_RENEW_FAILED", { email, error: sanitizePanelError(error) });
        throw error;
    } }
    static getClient(email) { return request(`/panel/api/clients/get/${encodeURIComponent(email)}`); }
    static links(email) { return request(`/panel/api/clients/links/${encodeURIComponent(email)}`).then((r) => { logger_1.logger.info("XRAY_CLIENT_LINKS_FETCHED", { email }); return r.obj; }).catch((e) => { logger_1.logger.warn("XRAY_CLIENT_LINKS_FAILED", { email, error: sanitizePanelError(e) }); throw e; }); }
    static traffic(email) { return request(`/panel/api/clients/traffic/${encodeURIComponent(email)}`).then((r) => { logger_1.logger.info("XRAY_CLIENT_TRAFFIC_FETCHED", { email }); return r.obj; }).catch((e) => { logger_1.logger.warn("XRAY_CLIENT_TRAFFIC_FAILED", { email, error: sanitizePanelError(e) }); throw e; }); }
}
exports.XrayClientService = XrayClientService;
