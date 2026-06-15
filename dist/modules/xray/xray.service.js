"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.XrayClientService = exports.XrayPanelService = exports.XRAY_GB = void 0;
exports.gbToBytes = gbToBytes;
exports.maskToken = maskToken;
exports.sanitizePanelError = sanitizePanelError;
exports.xrayInboundSnapshot = xrayInboundSnapshot;
exports.formatXrayBytes = formatXrayBytes;
exports.normalizeXrayStatus = normalizeXrayStatus;
exports.xrayTrafficSnapshot = xrayTrafficSnapshot;
exports.normalizeBaseUrl = normalizeBaseUrl;
exports.normalizeSubscriptionBaseUrl = normalizeSubscriptionBaseUrl;
exports.mergeXrayConfigPatch = mergeXrayConfigPatch;
const prisma_1 = require("../../services/prisma");
const logger_1 = require("../../services/logger");
const XRAY_TIMEOUT_MS = 10000;
exports.XRAY_GB = 1024n * 1024n * 1024n;
function gbToBytes(gb) { return BigInt(gb) * exports.XRAY_GB; }
function maskToken(token) { return token ? `${"*".repeat(Math.max(token.length - 4, 8))}${token.slice(-4)}` : "—"; }
function sanitizePanelError(error) { return error instanceof Error ? error.message.replace(/Bearer\s+\S+/gi, "Bearer ********") : String(error); }
function xrayInboundSnapshot(inbounds, selectedIds) {
    const selected = new Set(selectedIds);
    return JSON.stringify(inbounds.filter((inbound) => selected.has(inbound.id)).map(({ id, remark, protocol, port, tag, nodeId }) => ({ id, remark, protocol, port, tag, nodeId })));
}
function formatXrayBytes(value, options = {}) {
    const bytes = typeof value === "bigint" ? Number(value) : Number(value ?? 0);
    if (!Number.isFinite(bytes) || bytes <= 0)
        return options.unlimitedIfZero ? "نامحدود" : "0 GB";
    const gb = bytes / (1024 ** 3);
    return `${gb.toLocaleString("fa-IR", { maximumFractionDigits: options.maximumFractionDigits ?? 2 })} GB`;
}
function normalizeXrayStatus(status) { return { active: "فعال ✅", creating: "در حال آماده‌سازی ⏳", provisioning: "در حال آماده‌سازی ⏳", failed: "نیازمند بررسی ⚠️", renewal_failed: "نیازمند بررسی ⚠️", expired: "منقضی شده ⛔", disabled: "غیرفعال 🚫", missing_on_panel: "حذف‌شده از پنل", deleted: "حذف‌شده" }[String(status ?? "")] ?? "نامشخص"; }
function xrayTrafficSnapshot(traffic, fallbackTotal, fallbackUsed = 0n) {
    const up = BigInt(Math.max(0, Number(traffic?.up ?? 0)));
    const down = BigInt(Math.max(0, Number(traffic?.down ?? 0)));
    const usedBytes = traffic ? up + down : fallbackUsed;
    const totalBytes = traffic && traffic.total !== undefined && traffic.total !== null ? BigInt(Math.max(0, Number(traffic.total))) : fallbackTotal;
    return { usedBytes, totalBytes, remainingBytes: totalBytes > 0n ? (totalBytes > usedBytes ? totalBytes - usedBytes : 0n) : 0n };
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
    static async listGroups(config) { const res = await request("/panel/api/clients/groups", {}, config); const groups = (res.obj ?? []).filter((group) => typeof group.name === "string" && group.name.trim()).map((group) => ({ ...group, name: group.name.trim() })); logger_1.logger.info("XRAY_GROUPS_FETCHED", { count: groups.length }); return groups; }
    static async createClient(input) { logger_1.logger.info("XRAY_CLIENT_CREATE_REQUEST", { email: input.email, inboundIds: input.inboundIds, limitIp: input.limitIp ?? 0, groupName: input.groupName }); const client = { email: input.email, totalGB: Number(input.trafficBytes), expiryTime: input.expiresAt.getTime(), tgId: Number(input.telegramId), limitIp: Math.max(0, Number(input.limitIp ?? 0)), enable: true }; if (input.groupName)
        client.group = input.groupName; const res = await request("/panel/api/clients/add", { method: "POST", body: JSON.stringify({ client, inboundIds: input.inboundIds }) }); logger_1.logger.info("XRAY_CLIENT_CREATED", { email: input.email }); return res.obj ?? {}; }
    static async updateClient(email, input) { logger_1.logger.info("XRAY_CLIENT_RENEW_REQUEST", { email }); try {
        const existing = await this.getClient(email).catch(() => null);
        const existingClient = existing?.obj?.client ?? existing?.obj ?? {};
        const limitIp = input.limitIp ?? existingClient.limitIp ?? 0;
        const groupName = input.groupName ?? existingClient.group ?? undefined;
        const body = { email, totalGB: Number(input.totalBytes), expiryTime: input.expiresAt.getTime(), tgId: Number(input.telegramId), limitIp: Math.max(0, Number(limitIp ?? 0)), enable: true };
        if (groupName)
            body.group = groupName;
        const res = await request(`/panel/api/clients/update/${encodeURIComponent(email)}`, { method: "POST", body: JSON.stringify(body) });
        logger_1.logger.info("XRAY_CLIENT_RENEW_SUCCESS", { email });
        return res.obj;
    }
    catch (error) {
        logger_1.logger.error("XRAY_CLIENT_RENEW_FAILED", { email, error: sanitizePanelError(error) });
        throw error;
    } }
    static getClient(email) { return request(`/panel/api/clients/get/${encodeURIComponent(email)}`); }
    static links(email) { return request(`/panel/api/clients/links/${encodeURIComponent(email)}`).then((r) => r.obj); }
    static traffic(email) { return request(`/panel/api/clients/traffic/${encodeURIComponent(email)}`).then((r) => r.obj); }
    static subLinks(subId) { return request(`/panel/api/clients/subLinks/${encodeURIComponent(subId)}`).then((r) => r.obj); }
    static async ensureExistsOrMarkMissing(client) {
        try {
            const detail = await this.getClient(client.clientEmail);
            const obj = detail?.obj;
            if (obj && (Array.isArray(obj) ? obj.length > 0 : Object.keys(obj).length > 0))
                return { exists: true, detail };
        }
        catch (error) {
            const message = sanitizePanelError(error);
            if (!/404|not found|پیدا|HTTP 404/i.test(message))
                throw error;
        }
        await prisma_1.prisma.xrayClient.update({ where: { id: client.id }, data: { status: "missing_on_panel", lastError: "XRAY_CLIENT_MISSING_ON_PANEL" } });
        logger_1.logger.warn("XRAY_CLIENT_MISSING_ON_PANEL", { xrayClientId: client.id, email: client.clientEmail, userId: client.userId });
        return { exists: false, detail: null };
    }
    static async subscriptionUrl(client) {
        const config = await XrayPanelService.getEnabledConfig();
        let subId = client.clientSubId ?? undefined;
        if (!subId) {
            const detail = await this.getClient(client.clientEmail).catch(() => null);
            subId = detail?.obj?.subId ?? detail?.obj?.client?.subId ?? detail?.obj?.sub_id;
            if (subId)
                await prisma_1.prisma.xrayClient.update({ where: { id: client.id }, data: { clientSubId: String(subId) } });
        }
        if (!subId)
            throw new Error("شناسه اشتراک برای این سرویس هنوز از پنل دریافت نشده است.");
        if (!config?.subscriptionBaseUrl)
            throw new Error("لینک پایه اشتراک در تنظیمات Xray ثبت نشده است.");
        return `${normalizeSubscriptionBaseUrl(config.subscriptionBaseUrl)}/${encodeURIComponent(String(subId))}`;
    }
}
exports.XrayClientService = XrayClientService;
