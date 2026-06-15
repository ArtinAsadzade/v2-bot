"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentInvoiceService = exports.PaymentService = exports.PaymentGatewayService = void 0;
exports.maskApiKey = maskApiKey;
const crypto_1 = __importDefault(require("crypto"));
const library_1 = require("@prisma/client/runtime/library");
const prisma_1 = require("../../services/prisma");
const wallet_service_1 = require("../wallet/wallet.service");
const coupon_service_1 = require("../coupon/coupon.service");
const admin_service_1 = require("../admin/admin.service");
const event_bus_service_1 = require("../../services/event-bus.service");
const logger_1 = require("../../services/logger");
const monitoring_service_1 = require("../../services/monitoring.service");
const visibility_1 = require("../product/visibility");
const xray_service_1 = require("../xray/xray.service");
class GatewayHttpError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}
class GatewayConnectionError extends Error {
    constructor(message) {
        super(message);
    }
}
class DuplicateGatewayPayIdError extends Error {
    constructor(payId, existingInvoiceId) {
        super("شناسه پرداخت تکراری از درگاه دریافت شد");
        this.payId = payId;
        this.existingInvoiceId = existingInvoiceId;
    }
}
const CALLBACK_TOKEN_PARAM = "token";
const CALLBACK_INVOICE_PARAM = "invoice_id";
const ALREADY_PROCESSED_FA = "⚠️ این پرداخت قبلاً پردازش شده است.";
const DEFAULT_GATEWAY_API_BASE_URL = "http://136.244.104.77:5000/api/v1";
function slugify(value) { return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "svc"; }
function assertPositiveAmount(amount) {
    if (!Number.isInteger(amount) || amount <= 0)
        throw new Error("مبلغ پرداخت معتبر نیست");
}
function normalizeBaseUrl(url) {
    return url.trim().replace(/\/+$/, "");
}
function localGatewayUrlsAllowed() {
    return process.env.PAYMENT_GATEWAY_ALLOW_LOCAL_URLS === "true";
}
function isLocalHostname(hostname) {
    const normalized = hostname.toLowerCase();
    return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1" || normalized.endsWith(".localhost");
}
function assertValidHttpUrl(value, label, options = {}) {
    const raw = value.trim();
    if (!raw)
        throw new Error(`${label} الزامی است`);
    let parsed;
    try {
        parsed = new URL(raw);
    }
    catch {
        throw new Error(`${label} معتبر نیست`);
    }
    if (!/^https?:$/.test(parsed.protocol))
        throw new Error(`${label} معتبر نیست`);
    if (!parsed.hostname || parsed.hostname.length < 3)
        throw new Error(`${label} معتبر نیست`);
    if (isLocalHostname(parsed.hostname) && !localGatewayUrlsAllowed())
        throw new Error(`${label} localhost مجاز نیست`);
    if (!localGatewayUrlsAllowed() && !parsed.hostname.includes(".") && !/^\d+\.\d+\.\d+\.\d+$/.test(parsed.hostname))
        throw new Error(`${label} معتبر نیست`);
    return options.normalizeBase ? normalizeBaseUrl(parsed.toString()) : parsed.toString();
}
function validateUrl(value, label) {
    assertValidHttpUrl(value, label);
}
function parseGatewayResponse(body) {
    if (!body || typeof body !== "object")
        throw new Error("پاسخ درگاه معتبر نیست");
    const data = body;
    if (String(data.status ?? "").toLowerCase() !== "true")
        throw new Error(String(data.message ?? "درگاه ایجاد فاکتور را تأیید نکرد"));
    const payId = String(data.pay_id ?? "").trim();
    const paymentLink = String(data.payment_link ?? "").trim();
    if (!payId || !paymentLink)
        throw new Error("شناسه یا لینک پرداخت از درگاه دریافت نشد");
    validateUrl(paymentLink, "لینک پرداخت");
    return { payId, paymentLink };
}
function invoiceCallbackUrl(baseCallbackUrl, data) {
    const withId = baseCallbackUrl.includes("{invoiceId}") ? baseCallbackUrl.split("{invoiceId}").join(encodeURIComponent(data.invoiceId)) : baseCallbackUrl;
    const withToken = withId.includes("{token}") ? withId.split("{token}").join(encodeURIComponent(data.callbackToken)) : withId;
    const url = new URL(withToken);
    url.searchParams.set(CALLBACK_INVOICE_PARAM, data.invoiceId);
    url.searchParams.set(CALLBACK_TOKEN_PARAM, data.callbackToken);
    return url.toString();
}
function isValidObjectId(value) {
    return /^[a-f\d]{24}$/i.test(value);
}
async function rawPaymentInvoiceProjection(invoiceId) {
    try {
        const result = await prisma_1.prisma.$runCommandRaw({
            find: "PaymentInvoice",
            filter: { _id: { $oid: invoiceId } },
            projection: { _id: 1, status: 1, payId: 1 },
            limit: 1,
        });
        const cursor = result && typeof result === "object" && "cursor" in result ? result.cursor : undefined;
        const document = cursor?.firstBatch?.[0];
        return document && typeof document === "object" ? document : null;
    }
    catch (error) {
        paymentLog("PAYMENT_INVOICE_RAW_PROJECTION_FAILED", { invoiceId, error: error instanceof Error ? error.message : String(error) });
        return null;
    }
}
function normalizeCallbackReference(reference) {
    if (typeof reference === "string")
        return { invoice_id: reference.trim() };
    return {
        token: reference.token?.trim(),
        invoice: reference.invoice?.trim(),
        invoice_id: reference.invoice_id?.trim(),
        pay_id: reference.pay_id?.trim(),
    };
}
function metadataAmount(metadata) {
    const query = metadata.query && typeof metadata.query === "object" ? metadata.query : {};
    for (const key of ["amount", "price", "paid_amount", "gatewayAmount"]) {
        const raw = metadata[key] ?? query[key];
        if (raw === undefined || raw === null || raw === "")
            continue;
        const value = typeof raw === "number" ? raw : Number(String(raw).replace(/[,،\s]/g, ""));
        if (Number.isInteger(value) && value > 0)
            return value;
    }
    return undefined;
}
function safeJson(value) {
    try {
        return JSON.stringify(value);
    }
    catch {
        return JSON.stringify({ error: "unserializable" });
    }
}
function maskApiKey(apiKey) {
    if (!apiKey)
        return "ثبت نشده";
    const suffix = apiKey.slice(-4).toUpperCase();
    return `********${suffix}`;
}
function paymentLog(event, metadata = {}) {
    logger_1.logger.info(event, { event, ...metadata });
}
function xrayClientEmail(input) {
    return `tg${input.telegramId}-p${input.productId.slice(-8)}-o${input.orderId.slice(-8)}`.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 64);
}
async function audit(tx, data) {
    try {
        if (data.invoiceId) {
            await tx.paymentAuditLog.create({
                data: {
                    userId: data.userId ?? undefined,
                    invoiceId: data.invoiceId,
                    action: data.action,
                    metadata: data.metadata ? JSON.stringify({ ...data.metadata, actorId: data.actorId }) : data.actorId ? JSON.stringify({ actorId: data.actorId }) : undefined,
                },
            });
        }
        await tx.auditLog.create({
            data: {
                actorId: data.actorId ?? data.userId ?? "system",
                action: data.action,
                metadata: JSON.stringify({ invoiceId: data.invoiceId, userId: data.userId, ...(data.metadata ?? {}) }),
            },
        });
    }
    catch (error) {
        logger_1.logger.error("PAYMENT_AUDIT_LOG_FAILED", {
            event: "PAYMENT_AUDIT_LOG_FAILED",
            action: data.action,
            invoiceId: data.invoiceId,
            userId: data.userId,
            error: error instanceof Error ? error.message : String(error),
        });
    }
}
class PaymentGatewayService {
    static async getConfig() {
        return prisma_1.prisma.$transaction(async (tx) => {
            await tx.paymentGatewayConfig.upsert({
                where: { id: this.singletonId },
                update: {},
                create: { id: this.singletonId, enabled: false, apiBaseUrl: DEFAULT_GATEWAY_API_BASE_URL, apiKey: "", callbackUrl: "", gatewayName: "پرداخت آنی", displayOrder: 1 },
            });
            return tx.paymentGatewayConfig.findUniqueOrThrow({ where: { id: this.singletonId } });
        });
    }
    static async get() {
        return this.getConfig();
    }
    static validateConfig(input, options = {}) {
        if (input.apiBaseUrl !== undefined && (options.partial || input.apiBaseUrl.trim()))
            assertValidHttpUrl(input.apiBaseUrl, "آدرس API درگاه", { normalizeBase: true });
        if (input.callbackUrl !== undefined && (options.partial || input.callbackUrl.trim()))
            assertValidHttpUrl(input.callbackUrl, "آدرس callback درگاه");
        if (options.partial && input.apiKey !== undefined && !input.apiKey.trim())
            throw new Error("کلید API درگاه الزامی است");
        if (input.gatewayName !== undefined && !input.gatewayName.trim())
            throw new Error("نام درگاه الزامی است");
        if (input.displayOrder !== undefined && (!Number.isInteger(input.displayOrder) || input.displayOrder < 1))
            throw new Error("ترتیب نمایش معتبر نیست");
        if (!options.partial && input.enabled) {
            if (!input.apiBaseUrl?.trim())
                throw new Error("آدرس API درگاه الزامی است");
            if (!input.apiKey?.trim())
                throw new Error("کلید API درگاه الزامی است");
            if (!input.callbackUrl?.trim())
                throw new Error("آدرس callback درگاه الزامی است");
            assertValidHttpUrl(input.apiBaseUrl, "آدرس API درگاه", { normalizeBase: true });
            assertValidHttpUrl(input.callbackUrl, "آدرس callback درگاه");
        }
    }
    static validateField(field, value) {
        if (field === "apiBaseUrl")
            return assertValidHttpUrl(String(value ?? ""), "آدرس API درگاه", { normalizeBase: true });
        if (field === "callbackUrl")
            return assertValidHttpUrl(String(value ?? ""), "آدرس callback درگاه");
        if (field === "apiKey") {
            const apiKey = String(value ?? "").trim();
            if (!apiKey)
                throw new Error("کلید API درگاه الزامی است");
            if (apiKey.length < 8)
                throw new Error("کلید API درگاه کوتاه است");
            return apiKey;
        }
        if (field === "gatewayName") {
            const gatewayName = String(value ?? "").trim();
            if (!gatewayName)
                throw new Error("نام درگاه الزامی است");
            return gatewayName;
        }
        if (field === "displayOrder") {
            const displayOrder = Number(value);
            if (!Number.isInteger(displayOrder) || displayOrder < 1)
                throw new Error("ترتیب نمایش معتبر نیست");
            return displayOrder;
        }
        if (field === "enabled")
            return Boolean(value);
        throw new Error("فیلد تنظیمات درگاه معتبر نیست");
    }
    static validateConfigField(field, value) {
        return this.validateField(field, value);
    }
    static normalizeInput(input) {
        const normalized = {};
        for (const field of Object.keys(input)) {
            const value = input[field];
            if (value === undefined)
                continue;
            normalized[field] = this.validateField(field, value);
        }
        return normalized;
    }
    static async ensureConfig(tx) {
        return tx.paymentGatewayConfig.upsert({
            where: { id: this.singletonId },
            update: {},
            create: { id: this.singletonId, enabled: false, apiBaseUrl: DEFAULT_GATEWAY_API_BASE_URL, apiKey: "", callbackUrl: "", gatewayName: "پرداخت آنی", displayOrder: 1 },
        });
    }
    static assertCanEnable(config) {
        this.validateConfig({ ...config, enabled: true });
    }
    static async upsertConfig(input, actorId) {
        return prisma_1.prisma.$transaction(async (tx) => {
            const current = await this.ensureConfig(tx);
            const normalized = this.normalizeInput(input);
            const next = { ...current, ...normalized };
            if (normalized.enabled === true)
                this.assertCanEnable(next);
            await tx.paymentGatewayConfig.update({ where: { id: this.singletonId }, data: normalized });
            await tx.auditLog.create({
                data: {
                    actorId,
                    action: "payment_gateway.config.save",
                    metadata: JSON.stringify({
                        changedFields: Object.keys(normalized),
                        enabled: next.enabled,
                        apiBaseUrl: next.apiBaseUrl,
                        callbackUrl: next.callbackUrl,
                        gatewayName: next.gatewayName,
                        displayOrder: next.displayOrder,
                        apiKeyMasked: maskApiKey(next.apiKey),
                    }),
                },
            });
            return tx.paymentGatewayConfig.findUniqueOrThrow({ where: { id: this.singletonId } });
        });
    }
    static async updateConfigField(field, value, actorId) {
        return prisma_1.prisma.$transaction(async (tx) => {
            const current = await this.ensureConfig(tx);
            const normalizedValue = this.validateField(field, value);
            const data = { [field]: normalizedValue };
            const next = { ...current, [field]: normalizedValue };
            if (field === "enabled" && normalizedValue === true)
                this.assertCanEnable(next);
            await tx.paymentGatewayConfig.update({ where: { id: this.singletonId }, data });
            await tx.auditLog.create({
                data: {
                    actorId,
                    action: `payment_gateway.config.field.${String(field)}.save`,
                    metadata: JSON.stringify({
                        field,
                        value: field === "apiKey" ? undefined : normalizedValue,
                        apiKeyMasked: field === "apiKey" ? maskApiKey(String(normalizedValue)) : maskApiKey(next.apiKey),
                    }),
                },
            });
            return tx.paymentGatewayConfig.findUniqueOrThrow({ where: { id: this.singletonId } });
        });
    }
    static async saveConfig(input, actorId) {
        return this.upsertConfig(input, actorId);
    }
    static async updateConfig(input, actorId) {
        const fields = Object.keys(input).filter((field) => input[field] !== undefined);
        if (fields.length === 1)
            return this.updateConfigField(fields[0], input[fields[0]], actorId);
        return this.upsertConfig(input, actorId);
    }
    static async update(input, actorId) {
        return this.updateConfig(input, actorId);
    }
    static async setEnabled(enabled, actorId) {
        return this.updateConfigField("enabled", enabled, actorId);
    }
    static connectionFailureMessage(error) {
        if (error instanceof GatewayHttpError && error.status === 401)
            return "API Key نامعتبر است";
        if (error instanceof GatewayConnectionError)
            return "سرور درگاه در دسترس نیست";
        return error instanceof Error ? error.message : String(error);
    }
    static async testConnection(actorId) {
        const gateway = await this.getConfig();
        this.validateConfig({ ...gateway, enabled: true });
        const callbackUrl = invoiceCallbackUrl(gateway.callbackUrl, { invoiceId: `test-${Date.now()}`, callbackToken: crypto_1.default.randomBytes(16).toString("hex") });
        try {
            const { parsed, raw } = await PaymentService.requestGatewayInvoice(gateway, 1000, callbackUrl);
            const reloaded = await prisma_1.prisma.$transaction(async (tx) => {
                await tx.paymentGatewayConfig.update({ where: { id: this.singletonId }, data: { lastSuccessfulRequest: new Date(), lastConnectionStatus: "success", lastConnectionError: null } });
                await tx.auditLog.create({ data: { actorId, action: "payment_gateway.connection_test.success", metadata: JSON.stringify({ payId: parsed.payId, status: "success" }) } });
                return tx.paymentGatewayConfig.findUniqueOrThrow({ where: { id: this.singletonId } });
            });
            return { ok: true, message: "✅ اتصال با موفقیت برقرار شد", details: raw, config: reloaded };
        }
        catch (error) {
            const message = this.connectionFailureMessage(error);
            const reloaded = await prisma_1.prisma.$transaction(async (tx) => {
                await tx.paymentGatewayConfig.update({ where: { id: this.singletonId }, data: { lastFailedRequest: new Date(), lastConnectionStatus: "failed", lastConnectionError: message } });
                await tx.auditLog.create({ data: { actorId, action: "payment_gateway.connection_test.failed", metadata: JSON.stringify({ error: message }) } });
                return tx.paymentGatewayConfig.findUniqueOrThrow({ where: { id: this.singletonId } });
            });
            return { ok: false, message: `❌ ${message}`, error: message, config: reloaded };
        }
    }
}
exports.PaymentGatewayService = PaymentGatewayService;
PaymentGatewayService.singletonId = "singleton";
class PaymentService {
    static async requestGatewayInvoice(gateway, price, callbackUrl) {
        const payload = { price, callback_url: callbackUrl };
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        let response;
        try {
            response = await fetch(`${normalizeBaseUrl(gateway.apiBaseUrl)}/invoice/create`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-API-KEY": gateway.apiKey },
                body: JSON.stringify(payload),
                signal: controller.signal,
            });
        }
        catch (error) {
            throw new GatewayConnectionError(error instanceof Error && error.name === "AbortError" ? "درخواست درگاه timeout شد" : "سرور درگاه در دسترس نیست");
        }
        finally {
            clearTimeout(timeout);
        }
        const raw = await response.json().catch(() => ({}));
        if (!response.ok)
            throw new GatewayHttpError(response.status, `Gateway error ${response.status}: ${safeJson(raw)}`);
        return { parsed: parseGatewayResponse(raw), raw, payload };
    }
    static async quoteProductInvoice(tx, data) {
        const product = await this.validateProductForPurchase(data.userId, data.productId, undefined, tx);
        const originalAmount = product.price;
        let discountAmount = 0;
        let finalAmount = originalAmount;
        let couponId = null;
        let couponCode = null;
        if (data.couponCode?.trim()) {
            const validation = await coupon_service_1.CouponService.validateForCheckout({ code: data.couponCode, userId: data.userId, originalAmount, tx });
            if (!validation.ok) {
                paymentLog("COUPON_RECHECK_FAILED", { userId: data.userId, productId: data.productId, couponCode: (0, coupon_service_1.normalizeCouponCode)(data.couponCode), reason: validation.reason, severity: "warning" });
                await audit(tx, { userId: data.userId, action: "COUPON_RECHECK_FAILED", metadata: { productId: data.productId, couponCode: (0, coupon_service_1.normalizeCouponCode)(data.couponCode), reason: validation.reason, severity: "warning" } });
                throw new Error(validation.reason);
            }
            couponId = validation.coupon.id;
            couponCode = validation.coupon.code;
            discountAmount = validation.discountAmount;
            finalAmount = validation.finalAmount;
        }
        assertPositiveAmount(finalAmount);
        return { originalAmount, discountAmount, finalAmount, couponId, couponCode };
    }
    static assertInvoiceAmountIntegrity(invoice) {
        const expectedAmount = invoice.originalAmount > 0 ? invoice.originalAmount - invoice.discountAmount : invoice.amount;
        if (expectedAmount !== invoice.amount)
            return { ok: false, reason: "stored_final_amount_mismatch", expectedAmount };
        if (invoice.gatewayAmount !== null && invoice.gatewayAmount !== undefined && invoice.gatewayAmount !== invoice.amount)
            return { ok: false, reason: "gateway_amount_mismatch", expectedAmount };
        return { ok: true, expectedAmount };
    }
    static isUniqueConstraintError(error, field) {
        return error instanceof library_1.PrismaClientKnownRequestError && error.code === "P2002" && Array.isArray(error.meta?.target) && error.meta.target.includes(field);
    }
    static async attachGatewayInvoiceResponse(invoice, gatewayResult, gatewayAmount) {
        const duplicate = await prisma_1.prisma.paymentInvoice.findFirst({
            where: { payId: gatewayResult.parsed.payId, NOT: { id: invoice.id } },
            select: { id: true, userId: true, status: true },
        });
        if (duplicate) {
            paymentLog("PAYMENT_GATEWAY_DUPLICATE_PAY_ID", { invoiceId: invoice.id, userId: invoice.userId, payId: gatewayResult.parsed.payId, duplicateInvoiceId: duplicate.id });
            await audit(prisma_1.prisma, {
                userId: invoice.userId,
                invoiceId: invoice.id,
                action: "PAYMENT_GATEWAY_DUPLICATE_PAY_ID",
                metadata: { payId: gatewayResult.parsed.payId, duplicateInvoiceId: duplicate.id, duplicateUserId: duplicate.userId, duplicateStatus: duplicate.status },
            });
            throw new DuplicateGatewayPayIdError(gatewayResult.parsed.payId, duplicate.id);
        }
        try {
            paymentLog("PAYMENT_INVOICE_UPDATE_PAYID", { invoiceId: invoice.id, userId: invoice.userId, payId: gatewayResult.parsed.payId, gatewayAmount });
            await audit(prisma_1.prisma, { userId: invoice.userId, invoiceId: invoice.id, action: "PAYMENT_INVOICE_UPDATE_PAYID", metadata: { payId: gatewayResult.parsed.payId, gatewayAmount } });
            const attached = await prisma_1.prisma.paymentInvoice.updateMany({
                where: { id: invoice.id, status: "PENDING", OR: [{ payId: null }, { payId: { isSet: false } }] },
                data: {
                    payId: gatewayResult.parsed.payId,
                    paymentLink: gatewayResult.parsed.paymentLink,
                    gatewayAmount,
                    gatewayResponse: safeJson(gatewayResult.raw),
                },
            });
            if (attached.count === 1)
                return prisma_1.prisma.paymentInvoice.findUniqueOrThrow({ where: { id: invoice.id } });
            const current = await prisma_1.prisma.paymentInvoice.findUniqueOrThrow({ where: { id: invoice.id } });
            if (current.status === "PENDING" && current.payId === gatewayResult.parsed.payId && current.paymentLink === gatewayResult.parsed.paymentLink) {
                paymentLog("PAYMENT_LINK_READY", { invoiceId: current.id, userId: current.userId, payId: current.payId, idempotent: true });
                await audit(prisma_1.prisma, { userId: current.userId, invoiceId: current.id, action: "PAYMENT_LINK_READY", metadata: { payId: current.payId, idempotent: true } });
                return current;
            }
            throw new Error("فاکتور دیگر قابل اتصال به پاسخ درگاه نیست");
        }
        catch (error) {
            if (this.isUniqueConstraintError(error, "payId")) {
                const racedDuplicate = await prisma_1.prisma.paymentInvoice.findFirst({ where: { payId: gatewayResult.parsed.payId, NOT: { id: invoice.id } }, select: { id: true, userId: true, status: true } });
                paymentLog("PAYMENT_GATEWAY_DUPLICATE_PAY_ID", { invoiceId: invoice.id, userId: invoice.userId, payId: gatewayResult.parsed.payId, duplicateInvoiceId: racedDuplicate?.id, race: true });
                await audit(prisma_1.prisma, {
                    userId: invoice.userId,
                    invoiceId: invoice.id,
                    action: "PAYMENT_GATEWAY_DUPLICATE_PAY_ID",
                    metadata: { payId: gatewayResult.parsed.payId, duplicateInvoiceId: racedDuplicate?.id, duplicateUserId: racedDuplicate?.userId, duplicateStatus: racedDuplicate?.status, race: true },
                });
                throw new DuplicateGatewayPayIdError(gatewayResult.parsed.payId, racedDuplicate?.id ?? "unknown");
            }
            throw error;
        }
    }
    static async createInvoice(data) {
        assertPositiveAmount(data.amount);
        const gateway = await PaymentGatewayService.get();
        if (!gateway.enabled)
            throw new Error("پرداخت آنی در حال حاضر غیرفعال است");
        PaymentGatewayService.validateConfig(gateway);
        await this.assertUserCanPay(data.userId);
        if (data.type === "PRODUCT_PURCHASE")
            await this.validateProductForPurchase(data.userId, data.productId, undefined);
        const originalAmount = data.originalAmount ?? data.amount;
        const discountAmount = data.discountAmount ?? 0;
        if (originalAmount - discountAmount !== data.amount)
            throw new Error("مبلغ نهایی فاکتور با تخفیف همخوانی ندارد");
        const createPayload = {
            user: { connect: { id: data.userId } },
            amount: data.amount,
            originalAmount,
            discountAmount,
            coupon: data.couponId ? { connect: { id: data.couponId } } : undefined,
            couponCode: data.couponCode ?? undefined,
            callbackToken: crypto_1.default.randomBytes(32).toString("hex"),
            type: data.type,
            status: "PENDING",
            product: data.productId ? { connect: { id: data.productId } } : undefined,
            renewal: data.renewalId ? { connect: { id: data.renewalId } } : undefined,
            renewalXrayClientId: data.renewalXrayClientId,
        };
        paymentLog("PAYMENT_INVOICE_CREATE_PAYLOAD", {
            userId: data.userId,
            type: data.type,
            amount: data.amount,
            status: "PENDING",
            payId: Object.prototype.hasOwnProperty.call(createPayload, "payId") ? createPayload.payId : "<omitted>",
            hasPayId: Object.prototype.hasOwnProperty.call(createPayload, "payId"),
        });
        const invoice = await prisma_1.prisma.paymentInvoice.create({ data: createPayload });
        const rawCreatedInvoice = await rawPaymentInvoiceProjection(invoice.id);
        paymentLog("PAYMENT_INVOICE_CREATED", {
            invoiceId: invoice.id,
            userId: data.userId,
            type: data.type,
            amount: data.amount,
            status: "PENDING",
            rawDocument: rawCreatedInvoice ?? { _id: invoice.id, status: invoice.status, payId: "<raw projection unavailable>" },
            hasRawPayId: rawCreatedInvoice ? Object.prototype.hasOwnProperty.call(rawCreatedInvoice, "payId") : undefined,
        });
        await audit(prisma_1.prisma, { userId: data.userId, invoiceId: invoice.id, action: "PAYMENT_INVOICE_CREATED", metadata: { type: data.type, originalAmount, discountAmount, finalAmount: data.amount, couponId: data.couponId, couponCode: data.couponCode, status: "PENDING" } });
        if (data.couponId)
            await audit(prisma_1.prisma, { userId: data.userId, invoiceId: invoice.id, action: "COUPON_APPLIED", metadata: { couponId: data.couponId, couponCode: data.couponCode, originalAmount, discountAmount, finalAmount: data.amount, usageRecorded: false } });
        const callbackUrl = invoiceCallbackUrl(gateway.callbackUrl, { invoiceId: invoice.id, callbackToken: invoice.callbackToken });
        paymentLog("PAYMENT_GATEWAY_REQUEST", { invoiceId: invoice.id, userId: data.userId, endpoint: "/invoice/create", price: data.amount, callbackUrl });
        await audit(prisma_1.prisma, { userId: data.userId, invoiceId: invoice.id, action: "PAYMENT_GATEWAY_REQUEST", metadata: { endpoint: "/invoice/create", price: data.amount, callback_url: callbackUrl } });
        try {
            const gatewayResult = await this.requestGatewayInvoice(gateway, data.amount, callbackUrl);
            paymentLog("PAYMENT_INVOICE_GATEWAY_RESPONSE", { invoiceId: invoice.id, userId: data.userId, payId: gatewayResult.parsed.payId, paymentLink: gatewayResult.parsed.paymentLink });
            await audit(prisma_1.prisma, { userId: data.userId, invoiceId: invoice.id, action: "PAYMENT_INVOICE_GATEWAY_RESPONSE", metadata: gatewayResult.raw });
            const updatedInvoice = await this.attachGatewayInvoiceResponse(invoice, gatewayResult, data.amount);
            await prisma_1.prisma.paymentGatewayConfig.update({ where: { id: "singleton" }, data: { lastSuccessfulRequest: new Date(), lastConnectionStatus: "success", lastConnectionError: null } });
            paymentLog("PAYMENT_LINK_READY", { invoiceId: updatedInvoice.id, userId: updatedInvoice.userId, payId: updatedInvoice.payId, paymentLink: updatedInvoice.paymentLink });
            await audit(prisma_1.prisma, { userId: updatedInvoice.userId, invoiceId: updatedInvoice.id, action: "PAYMENT_LINK_READY", metadata: { payId: updatedInvoice.payId, paymentLink: updatedInvoice.paymentLink } });
            return updatedInvoice;
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            paymentLog("PAYMENT_GATEWAY_REQUEST_FAILED", { invoiceId: invoice.id, userId: data.userId, stage: "gateway_create", error: message });
            await prisma_1.prisma.paymentInvoice.update({ where: { id: invoice.id }, data: { gatewayResponse: safeJson({ error: message }), deliveryStatus: "GATEWAY_REQUEST_FAILED" } });
            await prisma_1.prisma.paymentGatewayConfig.update({ where: { id: "singleton" }, data: { lastFailedRequest: new Date(), lastConnectionStatus: "failed", lastConnectionError: message } });
            await audit(prisma_1.prisma, { userId: data.userId, invoiceId: invoice.id, action: "PAYMENT_GATEWAY_REQUEST_FAILED", metadata: { stage: "gateway_create", error: message } });
            if (error instanceof DuplicateGatewayPayIdError) {
                monitoring_service_1.MonitoringService.record({ type: "PAYMENT_FAILED", section: "Payment Gateway", description: `Duplicate gateway pay_id: ${error.payId}`, userId: data.userId, severity: "critical", suggestedAction: "درگاه پرداخت و یکتایی pay_id را بررسی کنید.", metadata: { invoiceId: invoice.id, duplicateInvoiceId: error.existingInvoiceId } });
                await prisma_1.prisma.paymentInvoice.update({ where: { id: invoice.id }, data: { gatewayResponse: safeJson({ error: error.message, payId: error.payId, duplicateInvoiceId: error.existingInvoiceId }), deliveryStatus: "DUPLICATE_GATEWAY_PAY_ID" } });
                throw new Error("پاسخ درگاه پرداخت معتبر نبود. موضوع ثبت شد و پشتیبانی در حال بررسی است.");
            }
            monitoring_service_1.MonitoringService.record({ type: "PAYMENT_FAILED", section: "Payment Gateway", description: message, userId: data.userId, severity: "critical", suggestedAction: "وضعیت API درگاه، کلید API و شبکه سرور را بررسی کنید.", metadata: { invoiceId: invoice.id, stage: "gateway_create" } });
            throw new Error("ارتباط با درگاه پرداخت برقرار نشد. لطفاً چند دقیقه دیگر دوباره تلاش کنید");
        }
    }
    static async findInvoiceByCallbackReference(reference) {
        const normalized = normalizeCallbackReference(reference);
        if (normalized.token) {
            const byToken = await prisma_1.prisma.paymentInvoice.findUnique({ where: { callbackToken: normalized.token } });
            if (byToken)
                return { invoice: byToken, matchedBy: "callbackToken" };
        }
        if (normalized.invoice && isValidObjectId(normalized.invoice)) {
            const byInvoice = await prisma_1.prisma.paymentInvoice.findUnique({ where: { id: normalized.invoice } });
            if (byInvoice)
                return { invoice: byInvoice, matchedBy: "invoice" };
        }
        if (normalized.invoice_id) {
            const byLegacyToken = await prisma_1.prisma.paymentInvoice.findUnique({ where: { callbackToken: normalized.invoice_id } });
            // Gateway documentation calls this parameter invoice_id, but older bot links used token/invoice/pay_id.
            // Never pass invoice_id to the ObjectId lookup until it is syntactically validated.
            if (byLegacyToken)
                return { invoice: byLegacyToken, matchedBy: "legacyToken" };
            if (isValidObjectId(normalized.invoice_id)) {
                const byLegacyInvoice = await prisma_1.prisma.paymentInvoice.findUnique({ where: { id: normalized.invoice_id } });
                if (byLegacyInvoice)
                    return { invoice: byLegacyInvoice, matchedBy: "legacyInvoice" };
            }
            const byPayId = await prisma_1.prisma.paymentInvoice.findFirst({ where: { payId: normalized.invoice_id } });
            if (byPayId)
                return { invoice: byPayId, matchedBy: "payId" };
        }
        if (normalized.pay_id) {
            const byPayId = await prisma_1.prisma.paymentInvoice.findFirst({ where: { payId: normalized.pay_id } });
            if (byPayId)
                return { invoice: byPayId, matchedBy: "payId" };
        }
        return null;
    }
    static async completePayment(reference, metadata = {}) {
        const normalizedReference = normalizeCallbackReference(reference);
        if (!normalizedReference.token && !normalizedReference.invoice && !normalizedReference.invoice_id && !normalizedReference.pay_id) {
            paymentLog("PAYMENT_CALLBACK_REJECTED", { reason: "missing_callback_reference", query: metadata.query });
            await prisma_1.prisma.auditLog.create({ data: { actorId: "system", action: "PAYMENT_CALLBACK_REJECTED", metadata: JSON.stringify({ reason: "missing_callback_reference", ...metadata }) } });
            monitoring_service_1.MonitoringService.record({ type: "PAYMENT_CALLBACK_FAILED", section: "Payment Callback", description: "Missing callback reference", severity: "critical", suggestedAction: "پارامترهای callback درگاه را بررسی کنید.", metadata });
            return { statusCode: 400, text: "Invalid payment callback." };
        }
        const resolved = await this.findInvoiceByCallbackReference(normalizedReference);
        if (!resolved) {
            paymentLog("PAYMENT_CALLBACK_REJECTED", { reason: "invoice_not_found", reference: normalizedReference, query: metadata.query });
            await prisma_1.prisma.auditLog.create({ data: { actorId: "system", action: "PAYMENT_CALLBACK_REJECTED", metadata: JSON.stringify({ reason: "invoice_not_found", reference: normalizedReference, ...metadata }) } });
            monitoring_service_1.MonitoringService.record({ type: "PAYMENT_CALLBACK_FAILED", section: "Payment Callback", description: "Payment invoice not found", severity: "critical", suggestedAction: "ارسال invoice_id/token/pay_id از سمت درگاه را بررسی کنید.", metadata: { reference: normalizedReference, ...metadata } });
            return { statusCode: 404, text: "Payment invoice not found." };
        }
        const invoice = resolved.invoice;
        const callbackAt = new Date();
        await prisma_1.prisma.paymentInvoice.update({ where: { id: invoice.id }, data: { callbackCount: { increment: 1 }, lastCallbackAt: callbackAt } });
        paymentLog("PAYMENT_CALLBACK_RECEIVED", { invoiceId: invoice.id, userId: invoice.userId, status: invoice.status, matchedBy: resolved.matchedBy, callbackAt: callbackAt.toISOString(), query: metadata.query });
        await audit(prisma_1.prisma, { userId: invoice.userId, invoiceId: invoice.id, action: "PAYMENT_CALLBACK_RECEIVED", metadata: { reference: normalizedReference, matchedBy: resolved.matchedBy, ...metadata } });
        const integrity = this.assertInvoiceAmountIntegrity(invoice);
        if (!integrity.ok) {
            const failed = await prisma_1.prisma.paymentInvoice.updateMany({ where: { id: invoice.id, status: "PENDING" }, data: { status: "FAILED", verifiedAt: new Date(), deliveryStatus: "FAILED" } });
            paymentLog("PAYMENT_PROCESS_FAILED", { invoiceId: invoice.id, userId: invoice.userId, stage: "callback_security", reason: integrity.reason, statusChanged: failed.count === 1 });
            await audit(prisma_1.prisma, { userId: invoice.userId, invoiceId: invoice.id, action: "PAYMENT_PROCESS_FAILED", metadata: { stage: "callback_security", reason: integrity.reason, gatewayAmount: invoice.gatewayAmount, amount: invoice.amount, originalAmount: invoice.originalAmount, discountAmount: invoice.discountAmount, amountExpected: integrity.expectedAmount } });
            monitoring_service_1.MonitoringService.record({ type: "PAYMENT_CALLBACK_FAILED", section: "Payment Callback", description: `Invoice amount mismatch: ${integrity.reason}`, userId: invoice.userId, severity: "critical", suggestedAction: "مبلغ فاکتور و مقدار برگشتی درگاه را بررسی کنید.", metadata: { invoiceId: invoice.id } });
            return { statusCode: 409, text: "Invoice amount mismatch.", failed: { invoice: { ...invoice, status: failed.count === 1 ? "FAILED" : invoice.status }, type: invoice.type } };
        }
        if (normalizedReference.pay_id && invoice.payId && normalizedReference.pay_id !== invoice.payId) {
            paymentLog("PAYMENT_CALLBACK_REJECTED", { invoiceId: invoice.id, userId: invoice.userId, reason: "pay_id_mismatch", expectedPayId: invoice.payId, receivedPayId: normalizedReference.pay_id });
            await audit(prisma_1.prisma, { userId: invoice.userId, invoiceId: invoice.id, action: "PAYMENT_CALLBACK_REJECTED", metadata: { reason: "pay_id_mismatch", expectedPayId: invoice.payId, receivedPayId: normalizedReference.pay_id, reference: normalizedReference } });
            monitoring_service_1.MonitoringService.record({ type: "PAYMENT_CALLBACK_FAILED", section: "Payment Callback", description: "pay_id mismatch", userId: invoice.userId, severity: "critical", suggestedAction: "احتمال callback اشتباه یا دستکاری شده را بررسی کنید.", metadata: { invoiceId: invoice.id, expectedPayId: invoice.payId, receivedPayId: normalizedReference.pay_id } });
            return { statusCode: 409, text: "Payment callback pay_id mismatch." };
        }
        if (normalizedReference.pay_id && !invoice.payId) {
            const duplicate = await prisma_1.prisma.paymentInvoice.findFirst({ where: { payId: normalizedReference.pay_id, NOT: { id: invoice.id } }, select: { id: true, userId: true, status: true } });
            if (duplicate) {
                paymentLog("PAYMENT_CALLBACK_REJECTED", { invoiceId: invoice.id, userId: invoice.userId, reason: "duplicate_callback_pay_id", payId: normalizedReference.pay_id, duplicateInvoiceId: duplicate.id });
                await audit(prisma_1.prisma, { userId: invoice.userId, invoiceId: invoice.id, action: "PAYMENT_GATEWAY_DUPLICATE_PAY_ID", metadata: { source: "callback", payId: normalizedReference.pay_id, duplicateInvoiceId: duplicate.id, duplicateUserId: duplicate.userId, duplicateStatus: duplicate.status } });
                monitoring_service_1.MonitoringService.record({ type: "PAYMENT_DUPLICATE_CALLBACK", section: "Payment Callback", description: `Duplicate callback pay_id: ${normalizedReference.pay_id}`, userId: invoice.userId, severity: "critical", suggestedAction: "pay_id تکراری در درگاه را فوری بررسی کنید.", metadata: { invoiceId: invoice.id, duplicateInvoiceId: duplicate.id } });
                return { statusCode: 409, text: "Duplicate gateway pay_id." };
            }
        }
        paymentLog("PAYMENT_CALLBACK_PROCESSING", { invoiceId: invoice.id, userId: invoice.userId, status: invoice.status, type: invoice.type });
        await audit(prisma_1.prisma, { userId: invoice.userId, invoiceId: invoice.id, action: "PAYMENT_CALLBACK_PROCESSING", metadata: { status: invoice.status, type: invoice.type, payId: invoice.payId } });
        paymentLog("PAYMENT_CALLBACK_VALIDATED", { invoiceId: invoice.id, userId: invoice.userId, status: invoice.status, type: invoice.type });
        await audit(prisma_1.prisma, { userId: invoice.userId, invoiceId: invoice.id, action: "PAYMENT_CALLBACK_VALIDATED", metadata: { status: invoice.status, type: invoice.type } });
        if (invoice.status === "COMPLETED" || invoice.status === "PAID") {
            paymentLog("PAYMENT_DUPLICATE_CALLBACK_IGNORED", { invoiceId: invoice.id, userId: invoice.userId, status: invoice.status });
            await audit(prisma_1.prisma, { userId: invoice.userId, invoiceId: invoice.id, action: "PAYMENT_DUPLICATE_CALLBACK_IGNORED", metadata: { status: invoice.status, reference: normalizedReference } });
            monitoring_service_1.MonitoringService.record({ type: "PAYMENT_DUPLICATE_CALLBACK", section: "Payment Callback", description: `Duplicate callback ignored for ${invoice.status}`, userId: invoice.userId, severity: "warning", suggestedAction: "اگر تکرار زیاد است، retry درگاه را بررسی کنید.", metadata: { invoiceId: invoice.id, status: invoice.status } });
            if (invoice.status === "COMPLETED")
                return { statusCode: 200, text: ALREADY_PROCESSED_FA };
        }
        if (invoice.status === "FAILED" || invoice.status === "CANCELED" || invoice.status === "EXPIRED")
            return { statusCode: 409, text: "Payment invoice is not payable." };
        let paidInvoice = invoice;
        if (invoice.status === "PENDING") {
            const markedPaid = await prisma_1.prisma.$transaction(async (tx) => {
                const locked = await tx.paymentInvoice.updateMany({
                    where: { id: invoice.id, status: "PENDING" },
                    data: { status: "PAID", paidAt: new Date(), verifiedAt: new Date(), deliveryStatus: "PENDING" },
                });
                if (locked.count !== 1)
                    return null;
                const fresh = await tx.paymentInvoice.findUniqueOrThrow({ where: { id: invoice.id } });
                await audit(tx, { userId: fresh.userId, invoiceId: fresh.id, action: "PAYMENT_INVOICE_MARKED_PAID", metadata: { payId: fresh.payId, amount: fresh.amount, type: fresh.type } });
                return fresh;
            });
            if (!markedPaid)
                return { statusCode: 200, text: ALREADY_PROCESSED_FA };
            paidInvoice = markedPaid;
            paymentLog("PAYMENT_INVOICE_MARKED_PAID", { invoiceId: paidInvoice.id, userId: paidInvoice.userId, payId: paidInvoice.payId, amount: paidInvoice.amount, type: paidInvoice.type });
            paymentLog("PAYMENT_MARKED_PAID", { invoiceId: paidInvoice.id, userId: paidInvoice.userId, payId: paidInvoice.payId, amount: paidInvoice.amount, type: paidInvoice.type });
        }
        const staleProcessingBefore = new Date(Date.now() - 5 * 60000);
        const fulfillmentLock = await prisma_1.prisma.paymentInvoice.updateMany({
            where: { id: paidInvoice.id, status: "PAID", OR: [{ deliveryStatus: null }, { deliveryStatus: { in: ["PENDING", "FAILED"] } }, { deliveryStatus: "PROCESSING", updatedAt: { lt: staleProcessingBefore } }] },
            data: { deliveryStatus: "PROCESSING" },
        });
        if (fulfillmentLock.count !== 1)
            return { statusCode: 200, text: ALREADY_PROCESSED_FA };
        try {
            paymentLog("PAYMENT_FULFILLMENT_STARTED", { invoiceId: paidInvoice.id, userId: paidInvoice.userId, type: paidInvoice.type });
            await audit(prisma_1.prisma, { userId: paidInvoice.userId, invoiceId: paidInvoice.id, action: "PAYMENT_FULFILLMENT_STARTED", metadata: { type: paidInvoice.type } });
            let result = await this.fulfillPaidInvoice(paidInvoice.id);
            if (result.needsXrayProvisioning && result.order?.id)
                result = await this.provisionXrayClient(result.order.id, paidInvoice.id);
            paymentLog("PAYMENT_COMPLETED", { invoiceId: paidInvoice.id, userId: paidInvoice.userId, type: paidInvoice.type });
            admin_service_1.AdminService.invalidateDashboardCache();
            return { statusCode: 200, text: "Payment completed successfully.", result };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            paymentLog("PAYMENT_PROCESS_FAILED", { invoiceId: paidInvoice.id, userId: paidInvoice.userId, stage: "fulfillment", error: message });
            paymentLog("PAYMENT_FAILED", { invoiceId: paidInvoice.id, userId: paidInvoice.userId, stage: "fulfillment", error: message });
            await prisma_1.prisma.paymentInvoice.update({ where: { id: paidInvoice.id }, data: { deliveryStatus: "FAILED_DELIVERY", verifiedAt: new Date() } });
            monitoring_service_1.MonitoringService.record({ type: "PAYMENT_DELIVERY_FAILED", section: "Payment Delivery", description: message, userId: paidInvoice.userId, severity: "critical", suggestedAction: "تحویل محصول/شارژ کیف پول را از پنل مدیریت بررسی و دستی اصلاح کنید.", metadata: { invoiceId: paidInvoice.id, type: paidInvoice.type } });
            event_bus_service_1.eventBus.emit("payment.delivery.failed", { invoiceId: paidInvoice.id, userId: paidInvoice.userId, type: paidInvoice.type, error: message });
            await audit(prisma_1.prisma, { userId: paidInvoice.userId, invoiceId: paidInvoice.id, action: "PAYMENT_PROCESS_FAILED", metadata: { stage: "fulfillment", error: message, statusKept: "PAID" } });
            return { statusCode: 500, text: "Payment processing failed.", failed: { invoice: paidInvoice, type: paidInvoice.type, error: message } };
        }
    }
    static async fulfillPaidInvoice(invoiceId) {
        return prisma_1.prisma.$transaction(async (tx) => {
            const fresh = await tx.paymentInvoice.findUniqueOrThrow({ where: { id: invoiceId } });
            if (fresh.status === "COMPLETED")
                return { invoice: fresh, type: fresh.type };
            if (fresh.status !== "PAID")
                throw new Error("فاکتور در وضعیت پرداخت‌شده نیست");
            if (fresh.deliveryStatus !== "PROCESSING")
                throw new Error("فاکتور در حال پردازش تحویل نیست");
            if (fresh.type === "XRAY_RENEWAL") {
                const result = await this.fulfillXrayRenewal(fresh.id);
                return { ...result, type: fresh.type };
            }
            if (fresh.type === "WALLET_TOPUP") {
                const user = await this.creditWallet(tx, { userId: fresh.userId, amount: fresh.amount, reason: `شارژ کیف پول با پرداخت آنی - فاکتور ${fresh.id}`, actorId: fresh.userId, invoiceId: fresh.id, referenceId: `invoice:${fresh.id}` });
                const completed = await tx.paymentInvoice.update({ where: { id: fresh.id }, data: { status: "COMPLETED", completedAt: new Date(), verifiedAt: new Date(), deliveryStatus: "COMPLETED" } });
                paymentLog("PAYMENT_WALLET_CREDITED", { invoiceId: fresh.id, userId: fresh.userId, amount: fresh.amount, balance: user.balance });
                await audit(tx, { userId: fresh.userId, invoiceId: fresh.id, action: "PAYMENT_WALLET_CREDITED", metadata: { amount: fresh.amount, balance: user.balance } });
                await audit(tx, { userId: fresh.userId, invoiceId: fresh.id, action: "PAYMENT_INVOICE_COMPLETED", metadata: { amount: fresh.amount, type: fresh.type } });
                return { invoice: completed, user, type: fresh.type };
            }
            if (fresh.orderId) {
                const existingOrder = await tx.order.findUnique({ where: { id: fresh.orderId }, include: { product: true, items: { include: { productAccount: true, xrayClient: true }, take: 1 } } });
                if (existingOrder?.items[0]) {
                    const existingClient = existingOrder.items[0].xrayClient;
                    if (existingClient && existingClient.status !== "active") {
                        if (existingClient.status === "failed")
                            throw new Error("تحویل Xray قبلاً ناموفق شده و نیازمند بررسی مدیر است");
                        return { invoice: fresh, order: existingOrder, product: existingOrder.product, account: { id: existingClient.id, username: existingClient.clientEmail, subscriptionLink: null, configLink: null, config: "XRAY_LIVE_LINKS" }, orderItem: existingOrder.items[0], xrayClient: existingClient, needsXrayProvisioning: existingClient.status === "provisioning" || existingClient.status === "creating", type: fresh.type };
                    }
                    const completed = await tx.paymentInvoice.update({ where: { id: fresh.id }, data: { status: "COMPLETED", completedAt: fresh.completedAt ?? new Date(), verifiedAt: new Date(), deliveryStatus: "COMPLETED" } });
                    return { invoice: completed, order: existingOrder, product: existingOrder.product, account: existingOrder.items[0].productAccount, orderItem: existingOrder.items[0], type: fresh.type };
                }
            }
            const delivered = await this.purchaseProduct(tx, { userId: fresh.userId, productId: fresh.productId ?? "", couponCode: fresh.couponCode ?? undefined, method: "INSTANT", invoice: fresh });
            if (delivered.xrayClient) {
                const processing = await tx.paymentInvoice.update({ where: { id: fresh.id }, data: { verifiedAt: new Date(), orderId: delivered.order.id, deliveryStatus: "PROCESSING" } });
                return { invoice: processing, ...delivered, needsXrayProvisioning: true, type: fresh.type };
            }
            const completed = await tx.paymentInvoice.update({ where: { id: fresh.id }, data: { status: "COMPLETED", completedAt: new Date(), verifiedAt: new Date(), orderId: delivered.order.id, deliveryStatus: "COMPLETED" } });
            paymentLog("PAYMENT_PRODUCT_DELIVERED", { invoiceId: fresh.id, userId: fresh.userId, orderId: delivered.order.id, productId: delivered.product.id, accountId: delivered.account.id });
            await audit(tx, { userId: fresh.userId, invoiceId: fresh.id, action: "PAYMENT_PRODUCT_DELIVERED", metadata: { orderId: delivered.order.id, productId: delivered.product.id, accountId: delivered.account.id } });
            await audit(tx, { userId: fresh.userId, invoiceId: fresh.id, action: "PAYMENT_INVOICE_COMPLETED", metadata: { orderId: delivered.order.id, amount: fresh.amount, type: fresh.type } });
            return { invoice: completed, ...delivered, needsXrayProvisioning: Boolean(delivered.xrayClient), type: fresh.type };
        });
    }
    static async buildXrayRenewalQuote(userId, xrayClientId, productId) {
        const [client, product] = await Promise.all([
            prisma_1.prisma.xrayClient.findFirstOrThrow({ where: { id: xrayClientId, userId }, include: { product: true } }),
            prisma_1.prisma.product.findFirstOrThrow({ where: { id: productId, mode: "xray_auto", isActive: true, deletedAt: null } }),
        ]);
        if (!product.trafficBytes || !product.durationDays)
            throw new Error("پلن تمدید Xray کامل نیست");
        let traffic = null;
        let liveOk = true;
        try {
            traffic = await xray_service_1.XrayClientService.traffic(client.clientEmail);
        }
        catch {
            liveOk = false;
        }
        const snapshot = (0, xray_service_1.xrayTrafficSnapshot)(traffic, client.trafficBytes, client.usedBytes);
        const now = new Date();
        const baseExpiry = client.expiresAt > now ? client.expiresAt : now;
        const newExpiry = new Date(baseExpiry.getTime() + product.durationDays * 86400000);
        const newTotalBytes = snapshot.totalBytes + product.trafficBytes;
        return { client, currentProduct: client.product, product, ...snapshot, newTotalBytes, oldExpiry: client.expiresAt, newExpiry, addTrafficBytes: product.trafficBytes, addDays: product.durationDays, liveOk };
    }
    static async renewXrayWithWallet(userId, xrayClientId, productId) {
        const quote = await this.buildXrayRenewalQuote(userId, xrayClientId, productId);
        const renewal = await prisma_1.prisma.$transaction(async (tx) => {
            await this.assertUserCanPay(userId, tx);
            const walletUser = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { balance: true } });
            if (walletUser.balance < quote.product.price)
                throw new Error("موجودی کیف پول کافی نیست");
            const created = await tx.xrayRenewal.create({ data: { userId, xrayClientId, renewalProductId: productId, oldTotalBytes: quote.totalBytes, newTotalBytes: quote.newTotalBytes, oldExpiry: quote.oldExpiry, newExpiry: quote.newExpiry, oldUsedBytes: quote.usedBytes, oldRemainingBytes: quote.remainingBytes, addTrafficBytes: quote.addTrafficBytes, addDays: quote.addDays, status: "provisioning" } });
            await this.debitWallet(tx, { userId, amount: quote.product.price, reason: `تمدید سرویس Xray ${quote.client.clientEmail}`, actorId: userId, referenceId: `xray-renewal:${created.id}` });
            return created;
        });
        return this.applyXrayRenewal(renewal.id);
    }
    static async createXrayRenewalInvoice(userId, xrayClientId, productId) {
        const quote = await this.buildXrayRenewalQuote(userId, xrayClientId, productId);
        const renewal = await prisma_1.prisma.xrayRenewal.create({ data: { userId, xrayClientId, renewalProductId: productId, oldTotalBytes: quote.totalBytes, newTotalBytes: quote.newTotalBytes, oldExpiry: quote.oldExpiry, newExpiry: quote.newExpiry, oldUsedBytes: quote.usedBytes, oldRemainingBytes: quote.remainingBytes, addTrafficBytes: quote.addTrafficBytes, addDays: quote.addDays, status: "provisioning" } });
        const invoice = await this.createInvoice({ userId, amount: quote.product.price, originalAmount: quote.product.price, discountAmount: 0, type: "XRAY_RENEWAL", productId, renewalId: renewal.id, renewalXrayClientId: xrayClientId });
        await prisma_1.prisma.xrayRenewal.update({ where: { id: renewal.id }, data: { invoiceId: invoice.id } });
        return invoice;
    }
    static async fulfillXrayRenewal(invoiceId) {
        const invoice = await prisma_1.prisma.paymentInvoice.findUniqueOrThrow({ where: { id: invoiceId } });
        const renewal = invoice.renewalId ? await prisma_1.prisma.xrayRenewal.findUniqueOrThrow({ where: { id: invoice.renewalId }, include: { xrayClient: true, renewalProduct: true } }) : await prisma_1.prisma.xrayRenewal.findFirstOrThrow({ where: { invoiceId }, include: { xrayClient: true, renewalProduct: true } });
        const updated = await this.applyXrayRenewal(renewal.id, invoiceId);
        const completed = await prisma_1.prisma.paymentInvoice.update({ where: { id: invoiceId }, data: { status: "COMPLETED", completedAt: new Date(), verifiedAt: new Date(), deliveryStatus: "COMPLETED" } });
        return { invoice: completed, renewal: updated, xrayClient: updated.xrayClient };
    }
    static async applyXrayRenewal(renewalId, invoiceId) {
        const renewal = await prisma_1.prisma.xrayRenewal.findUniqueOrThrow({ where: { id: renewalId }, include: { xrayClient: true, renewalProduct: true } });
        if (renewal.status === "active")
            return renewal;
        try {
            await xray_service_1.XrayClientService.updateClient(renewal.xrayClient.clientEmail, { totalBytes: renewal.newTotalBytes, expiresAt: renewal.newExpiry, telegramId: renewal.xrayClient.telegramId, limitIp: renewal.xrayClient.limitIp ?? renewal.renewalProduct.xrayLimitIp ?? 0, groupName: renewal.xrayClient.groupName ?? renewal.renewalProduct.xrayGroupName });
            const [, updatedRenewal] = await prisma_1.prisma.$transaction([
                prisma_1.prisma.xrayClient.update({ where: { id: renewal.xrayClientId }, data: { trafficBytes: renewal.newTotalBytes, expiresAt: renewal.newExpiry, limitIp: renewal.xrayClient.limitIp ?? renewal.renewalProduct.xrayLimitIp ?? 0, groupName: renewal.xrayClient.groupName ?? renewal.renewalProduct.xrayGroupName, status: "active", lastError: null } }),
                prisma_1.prisma.xrayRenewal.update({ where: { id: renewal.id }, data: { status: "active", lastError: null, invoiceId: invoiceId ?? renewal.invoiceId } }),
            ]);
            return prisma_1.prisma.xrayRenewal.findUniqueOrThrow({ where: { id: updatedRenewal.id }, include: { xrayClient: true, renewalProduct: true } });
        }
        catch (error) {
            const message = (0, xray_service_1.sanitizePanelError)(error);
            await prisma_1.prisma.xrayRenewal.update({ where: { id: renewal.id }, data: { status: "renewal_failed", lastError: message, invoiceId: invoiceId ?? renewal.invoiceId } });
            await prisma_1.prisma.xrayClient.update({ where: { id: renewal.xrayClientId }, data: { status: "renewal_failed", lastError: message } });
            monitoring_service_1.MonitoringService.record({ type: "PAYMENT_DELIVERY_FAILED", section: "Xray Renewal", description: message, userId: renewal.userId, severity: "critical", suggestedAction: "تمدید پرداخت‌شده را از پنل بررسی و دستی اعمال کنید.", metadata: { renewalId: renewal.id, invoiceId } });
            throw new Error("پرداخت موفق بود اما تمدید سرویس نیازمند بررسی است.");
        }
    }
    static async markNotification(invoiceId, status, metadata = {}) {
        const invoice = await prisma_1.prisma.paymentInvoice.update({ where: { id: invoiceId }, data: { notificationStatus: status } });
        paymentLog(status === "SENT" ? "PAYMENT_NOTIFICATION_SENT" : "PAYMENT_NOTIFICATION_FAILED", { invoiceId, userId: invoice.userId, ...metadata });
        await audit(prisma_1.prisma, { userId: invoice.userId, invoiceId, action: status === "SENT" ? "PAYMENT_NOTIFICATION_SENT" : "PAYMENT_NOTIFICATION_FAILED", metadata });
        return invoice;
    }
    static async creditWallet(tx, data) {
        const user = await wallet_service_1.WalletService.credit(data.userId, data.amount, data.reason, tx, { actorId: data.actorId, referenceId: data.referenceId });
        await audit(tx, { userId: data.userId, invoiceId: data.invoiceId, action: "WALLET_CREDITED", actorId: data.actorId, metadata: { amount: data.amount, balance: user.balance, reason: data.reason, referenceId: data.referenceId } });
        return user;
    }
    static async debitWallet(tx, data) {
        const user = await wallet_service_1.WalletService.debit(data.userId, data.amount, data.reason, tx, { actorId: data.actorId, referenceId: data.referenceId });
        await audit(tx, { userId: data.userId, invoiceId: data.invoiceId, action: "Wallet Debited", actorId: data.actorId, metadata: { amount: data.amount, balance: user.balance, reason: data.reason, referenceId: data.referenceId } });
        return user;
    }
    static async purchaseProduct(tx, data) {
        if (!data.productId)
            throw new Error("محصول فاکتور مشخص نیست");
        await this.assertUserCanPay(data.userId, tx);
        const product = await this.validateProductForPurchase(data.userId, data.productId, undefined, tx);
        let discountAmount = 0;
        let couponId = null;
        let couponMaxUses = 0;
        const originalAmount = product.price;
        let totalAmount = originalAmount;
        if (data.invoice) {
            if (data.invoice.userId !== data.userId || data.invoice.productId !== data.productId)
                throw new Error("فاکتور با خرید همخوانی ندارد");
            if (data.invoice.originalAmount !== originalAmount)
                throw new Error("مبلغ اصلی فاکتور با محصول همخوانی ندارد");
            if (data.invoice.status !== "PAID")
                throw new Error("پرداخت تایید نشده است");
            couponId = data.invoice.couponId ?? null;
            discountAmount = data.invoice.discountAmount;
            totalAmount = data.invoice.amount;
            if (originalAmount - discountAmount !== totalAmount)
                throw new Error("مبلغ فاکتور با مبلغ خرید همخوانی ندارد");
        }
        else if (data.couponCode) {
            const validation = await coupon_service_1.CouponService.validateForCheckout({ code: data.couponCode, userId: data.userId, originalAmount, tx });
            if (!validation.ok) {
                paymentLog("COUPON_RECHECK_FAILED", { userId: data.userId, productId: data.productId, couponCode: (0, coupon_service_1.normalizeCouponCode)(data.couponCode), reason: validation.reason, severity: "warning" });
                await audit(tx, { userId: data.userId, invoiceId: undefined, action: "COUPON_RECHECK_FAILED", metadata: { productId: data.productId, couponCode: (0, coupon_service_1.normalizeCouponCode)(data.couponCode), reason: validation.reason, severity: "warning" } });
                throw new Error(validation.reason);
            }
            couponId = validation.coupon.id;
            couponMaxUses = validation.coupon.maxUses;
            discountAmount = validation.discountAmount;
            totalAmount = validation.finalAmount;
        }
        const isXray = product.mode === "xray_auto" && Boolean(product.trafficBytes && product.durationDays && product.stockLimit && product.inboundIds.length);
        if (data.method === "WALLET" && totalAmount > 0) {
            const walletUser = await tx.user.findUniqueOrThrow({ where: { id: data.userId }, select: { balance: true } });
            if (walletUser.balance < totalAmount)
                throw new Error("موجودی کیف پول کافی نیست");
        }
        let account = null;
        const reservedAt = new Date();
        if (isXray) {
            if (data.method === "WALLET") {
                const duplicate = await tx.xrayClient.findFirst({
                    where: { userId: data.userId, productId: product.id, status: { in: ["provisioning", "creating", "active"] }, order: { status: { in: ["pending", "panel_creating", "panel_verified", "delivered"] } } },
                    orderBy: { createdAt: "desc" },
                });
                if (duplicate)
                    throw new Error("درخواست خرید قبلی شما برای این محصول هنوز در حال پردازش است");
            }
            if (!product.trafficBytes || !product.durationDays || !product.stockLimit || !product.inboundIds.length)
                throw new Error("تنظیمات محصول Xray کامل نیست");
            await audit(tx, { userId: data.userId, invoiceId: data.invoice?.id, action: "XRAY_DELIVERY_PENDING", metadata: { productId: product.id, method: data.method } });
        }
        else {
            const candidates = await tx.productAccount.findMany({ where: { AND: [(0, visibility_1.availableInventoryWhere)(product.id), (0, visibility_1.unassignedInventoryWhere)()] }, orderBy: { createdAt: "asc" }, take: 10 });
            for (const candidate of candidates) {
                const reserved = await tx.productAccount.updateMany({ where: { id: candidate.id, productId: product.id, status: "available", soldTo: null, soldAt: null, assignedTo: null, assignedAt: null }, data: { status: "reserved", reservedBy: data.userId, reservedAt, reservationExpiresAt: new Date(reservedAt.getTime() + 15 * 60000) } });
                if (reserved.count === 1) {
                    account = candidate;
                    break;
                }
            }
            if (!account)
                throw new Error("موجودی این محصول تمام شده است");
            await tx.productAccountHistory.create({ data: { accountId: account.id, actorId: data.userId, action: "Inventory Reserved", fromValue: "available", toValue: "reserved", metadata: JSON.stringify({ invoiceId: data.invoice?.id, productId: product.id, reservedAt, method: data.method }) } });
            await audit(tx, { userId: data.userId, invoiceId: data.invoice?.id, action: "Inventory Reserved", metadata: { accountId: account.id, productId: product.id, method: data.method } });
        }
        if (couponId && !isXray) {
            const couponLimit = await tx.coupon.findUniqueOrThrow({ where: { id: couponId }, select: { maxUses: true, perUserLimit: true, status: true, deletedAt: true, expiresAt: true } });
            const usageCount = await tx.couponUsage.count({ where: { couponId, userId: data.userId } });
            if (usageCount >= couponLimit.perUserLimit) {
                await audit(tx, { userId: data.userId, invoiceId: data.invoice?.id, action: "COUPON_USAGE_RACE_BLOCKED", metadata: { couponId, reason: "per_user_limit" } });
                throw new Error("سقف استفاده شما از این کد تخفیف تکمیل شده است");
            }
            const couponUpdated = await tx.coupon.updateMany({ where: { id: couponId, status: "active", deletedAt: null, usedCount: { lt: couponLimit.maxUses }, expiresAt: { gt: new Date() } }, data: { usedCount: { increment: 1 } } });
            if (couponUpdated.count !== 1) {
                await audit(tx, { userId: data.userId, invoiceId: data.invoice?.id, action: "COUPON_USAGE_RACE_BLOCKED", metadata: { couponId, reason: "global_limit_or_expired" } });
                throw new Error("کد تخفیف دیگر قابل استفاده نیست");
            }
        }
        const order = await tx.order.create({ data: { userId: data.userId, productId: product.id, couponId, originalAmount, totalAmount, finalPaidAmount: totalAmount, discountAmount, status: "pending" } });
        const purchaseDate = new Date();
        const durationDays = isXray ? (product.durationDays ?? product.duration) : (account.durationDays ?? product.duration);
        const expiresAt = new Date(purchaseDate.getTime() + durationDays * 86400000);
        let xrayClient = null;
        let orderItem;
        if (isXray) {
            const user = await tx.user.findUniqueOrThrow({ where: { id: data.userId }, select: { telegramId: true } });
            const email = xrayClientEmail({ telegramId: user.telegramId, productId: product.id, orderId: order.id });
            xrayClient = await tx.xrayClient.upsert({
                where: { clientEmail: email },
                update: {},
                create: { userId: data.userId, telegramId: user.telegramId, productId: product.id, orderId: order.id, clientEmail: email, inboundIds: product.inboundIds, limitIp: product.xrayLimitIp ?? 0, groupName: product.xrayGroupName, expiresAt, trafficBytes: product.trafficBytes, status: "provisioning" },
            });
            orderItem = null;
        }
        else {
            orderItem = await tx.orderItem.create({ data: { orderId: order.id, productId: product.id, productAccountId: account.id, deliveredUsername: account.username, deliveredPassword: account.password, deliveredSubscriptionLink: account.subscriptionLink, deliveredConfigLink: account.configLink, deliveredConfig: account.configLink || account.config, purchaseDate, expiresAt, isActive: true } });
        }
        if (couponId && !isXray) {
            const usageSlot = await tx.couponUsage.count({ where: { couponId, userId: data.userId } });
            await tx.couponUsage.create({ data: { couponId, userId: data.userId, orderId: order.id, usageSlot } });
            await audit(tx, { userId: data.userId, invoiceId: data.invoice?.id, action: "COUPON_USAGE_RECORDED", metadata: { couponId, orderId: order.id, usageSlot, originalAmount, discountAmount, finalAmount: totalAmount } });
        }
        if (!isXray) {
            const soldAt = new Date();
            const sold = await tx.productAccount.updateMany({ where: { id: account.id, productId: product.id, status: "reserved", reservedBy: data.userId, AND: [(0, visibility_1.unassignedInventoryWhere)()] }, data: { status: "sold", soldTo: data.userId, soldAt, assignedTo: data.userId, assignedAt: soldAt, expiresAt, reservedBy: null, reservedAt: null } });
            if (sold.count !== 1)
                throw new Error("تحویل اکانت ناموفق بود");
            if (!orderItem)
                throw new Error("آیتم سفارش تحویلی نامعتبر است");
            if (!orderItem.productAccountId)
                throw new Error("شناسه اکانت تحویلی نامعتبر است");
            if (data.method === "WALLET" && totalAmount > 0) {
                await this.debitWallet(tx, { userId: data.userId, amount: totalAmount, reason: `خرید محصول ${product.title}`, actorId: data.userId, referenceId: `purchase:${order.id}` });
            }
            await tx.order.update({ where: { id: order.id }, data: { status: "delivered" } });
            await tx.productAccountHistory.create({ data: { accountId: account.id, actorId: data.userId, action: "Inventory Sold", fromValue: "reserved", toValue: "sold", metadata: JSON.stringify({ invoiceId: data.invoice?.id, orderId: order.id, orderItemId: orderItem.id, productId: product.id, soldAt, expiresAt, method: data.method }) } });
            await audit(tx, { userId: data.userId, invoiceId: data.invoice?.id, action: "Inventory Sold", metadata: { accountId: account.id, orderId: order.id } });
        }
        await audit(tx, { userId: data.userId, invoiceId: data.invoice?.id, action: isXray ? "XRAY_PRODUCT_DELIVERED" : "PRODUCT_DELIVERED", metadata: { productId: product.id, orderId: order.id, accountId: account?.id, xrayClientId: xrayClient?.id, method: data.method, originalAmount, discountAmount, finalAmount: totalAmount } });
        const deliveredAccount = account ? await tx.productAccount.findUniqueOrThrow({ where: { id: account.id } }) : { id: xrayClient.id, username: xrayClient.clientEmail, subscriptionLink: null, configLink: null, config: "XRAY_LIVE_LINKS" };
        return { order, product, account: deliveredAccount, orderItem, xrayClient, totalAmount, originalAmount, discountAmount, couponId, couponCode: data.couponCode, expiresAt };
    }
    static async provisionXrayClient(orderId, invoiceId) {
        const client = await prisma_1.prisma.xrayClient.findFirstOrThrow({ where: { orderId }, include: { order: true, product: true } });
        if (client.status === "active") {
            const orderItem = await prisma_1.prisma.orderItem.findFirst({ where: { xrayClientId: client.id } });
            const product = client.product ?? await prisma_1.prisma.product.findUniqueOrThrow({ where: { id: client.productId ?? "" } });
            return { order: client.order, product, account: { id: client.id, username: client.clientEmail, subscriptionLink: null, configLink: null, config: "XRAY_LIVE_LINKS" }, orderItem, xrayClient: client, totalAmount: client.order?.totalAmount ?? 0, originalAmount: client.order?.originalAmount ?? 0, discountAmount: client.order?.discountAmount ?? 0, couponId: client.order?.couponId ?? null, couponCode: undefined, expiresAt: client.expiresAt };
        }
        if (client.status !== "provisioning" && client.status !== "creating")
            throw new Error("تحویل Xray قبلاً ناموفق شده و نیازمند بررسی مدیر است");
        const product = client.product ?? await prisma_1.prisma.product.findUniqueOrThrow({ where: { id: client.productId ?? "" } });
        let panelClientCreated = false;
        try {
            const claimed = await prisma_1.prisma.xrayClient.updateMany({ where: { id: client.id, status: "provisioning" }, data: { status: "creating" } });
            if (claimed.count !== 1 && client.status !== "creating")
                throw new Error("درخواست خرید قبلی شما برای این محصول هنوز در حال پردازش است");
            await prisma_1.prisma.order.update({ where: { id: orderId }, data: { status: "panel_creating" } });
            const created = await xray_service_1.XrayClientService.createClient({ email: client.clientEmail, trafficBytes: client.trafficBytes, expiresAt: client.expiresAt, telegramId: client.telegramId, inboundIds: client.inboundIds, limitIp: client.limitIp, groupName: client.groupName });
            panelClientCreated = true;
            const verified = await xray_service_1.XrayClientService.verifyPanelClient({ email: client.clientEmail, expectedInboundIds: client.inboundIds, requireLinks: true });
            await prisma_1.prisma.order.update({ where: { id: orderId }, data: { status: "panel_verified" } });
            const result = await prisma_1.prisma.$transaction(async (tx) => {
                const freshOrder = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
                const sold = await tx.product.updateMany({ where: { id: product.id, mode: "xray_auto", soldCount: { lt: product.stockLimit ?? 0 } }, data: { soldCount: { increment: 1 } } });
                if (sold.count !== 1)
                    throw new Error("موجودی این محصول تمام شده است");
                if (!invoiceId && freshOrder.totalAmount > 0)
                    await this.debitWallet(tx, { userId: client.userId, amount: freshOrder.totalAmount, reason: `خرید محصول ${product.title}`, actorId: client.userId, referenceId: `purchase:${orderId}` });
                let item = await tx.orderItem.findFirst({ where: { xrayClientId: client.id } });
                if (!item)
                    item = await tx.orderItem.create({ data: { orderId, productId: product.id, xrayClientId: client.id, deliveredUsername: client.clientEmail, deliveredSubscriptionLink: null, deliveredConfigLink: null, deliveredConfig: "XRAY_LIVE_LINKS", purchaseDate: new Date(), expiresAt: client.expiresAt, isActive: true } });
                if (freshOrder.couponId) {
                    const used = await tx.couponUsage.count({ where: { couponId: freshOrder.couponId, userId: client.userId } });
                    if (used === 0)
                        await tx.couponUsage.create({ data: { couponId: freshOrder.couponId, userId: client.userId, orderId, usageSlot: 0 } });
                }
                const updatedClient = await tx.xrayClient.update({ where: { id: client.id }, data: { status: "active", clientSubId: verified.subId ?? created.subId, panelClientId: verified.panelClientId ?? created.uuid ?? created.id, lastError: null } });
                const completedOrder = await tx.order.update({ where: { id: orderId }, data: { status: "delivered" } });
                if (invoiceId)
                    await tx.paymentInvoice.update({ where: { id: invoiceId }, data: { deliveryStatus: "COMPLETED", status: "COMPLETED", completedAt: new Date(), verifiedAt: new Date(), orderId } });
                await audit(tx, { userId: client.userId, invoiceId, action: "XRAY_PRODUCT_DELIVERED", metadata: { orderId, xrayClientId: client.id, deliveryId: orderId, panelClientId: verified.panelClientId, step: "delivered", status: "success" } });
                return { order: completedOrder, orderItem: item, xrayClient: updatedClient };
            });
            return { order: result.order, product, account: { id: result.xrayClient.id, username: result.xrayClient.clientEmail, subscriptionLink: null, configLink: null, config: "XRAY_LIVE_LINKS" }, orderItem: result.orderItem, xrayClient: result.xrayClient, totalAmount: result.order.totalAmount, originalAmount: result.order.originalAmount, discountAmount: result.order.discountAmount, couponId: result.order.couponId, couponCode: undefined, expiresAt: result.xrayClient.expiresAt };
        }
        catch (error) {
            const message = (0, xray_service_1.sanitizePanelError)(error);
            logger_1.logger.error("XRAY_CLIENT_CREATE_FAILED", { orderId, deliveryId: orderId, userId: client.userId, productId: client.productId, xrayClientId: client.id, step: "panel_verified", status: "failed", error: message });
            let cleanupStatus = "failed";
            if (panelClientCreated) {
                try {
                    await xray_service_1.XrayClientService.deleteClient(client.clientEmail);
                    await prisma_1.prisma.auditLog.create({ data: { actorId: client.userId, action: "xray_delivery.panel_client_deleted", metadata: JSON.stringify({ orderId, xrayClientId: client.id, email: client.clientEmail, reason: message }) } });
                }
                catch (cleanupError) {
                    cleanupStatus = "orphaned_panel_client";
                    await prisma_1.prisma.auditLog.create({ data: { actorId: client.userId, action: "xray_delivery.orphaned_panel_client", metadata: JSON.stringify({ orderId, deliveryId: orderId, xrayClientId: client.id, email: client.clientEmail, error: message, cleanupError: (0, xray_service_1.sanitizePanelError)(cleanupError) }) } });
                }
            }
            await prisma_1.prisma.xrayClient.update({ where: { id: client.id }, data: { status: cleanupStatus, lastError: message } });
            await prisma_1.prisma.order.update({ where: { id: orderId }, data: { status: "failed_delivery" } });
            if (invoiceId)
                await prisma_1.prisma.paymentInvoice.update({ where: { id: invoiceId }, data: { deliveryStatus: "FAILED_DELIVERY", verifiedAt: new Date(), orderId } });
            await prisma_1.prisma.auditLog.create({ data: { actorId: client.userId, action: "xray_delivery.failed", metadata: JSON.stringify({ orderId, deliveryId: orderId, xrayClientId: client.id, error: message, panelClientCreated, cleanupStatus }) } });
            monitoring_service_1.MonitoringService.record({ type: "XRAY_CLIENT_CREATE_FAILED", section: "Xray Delivery", description: message, userId: client.userId, severity: "critical", suggestedAction: "تحویل سرویس Xray را بررسی و دستی retry کنید. کیف پول تا قبل از verify کسر نمی‌شود و کلاینت پنل حذف/علامت‌گذاری می‌شود.", metadata: { orderId, xrayClientId: client.id, panelClientCreated, cleanupStatus } });
            throw new Error("ساخت اکانت با مشکل مواجه شد. مبلغی از کیف پول شما کسر نشده / سهمیه تست شما مصرف نشده است. لطفاً دوباره تلاش کنید یا با پشتیبانی تماس بگیرید.");
        }
    }
    static async purchaseProductWithWallet(userId, productId, couponCode) {
        let result;
        try {
            result = await prisma_1.prisma.$transaction((tx) => this.purchaseProduct(tx, { userId, productId, couponCode, method: "WALLET" }));
            if (result.xrayClient)
                result = await this.provisionXrayClient(result.order.id);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (/کد تخفیف|کوپن|تخفیف/.test(message)) {
                paymentLog("COUPON_RECHECK_FAILED", { userId, productId, couponCode, reason: message, severity: "warning" });
            }
            else {
                monitoring_service_1.MonitoringService.record({ type: "PURCHASE_FAILED", section: "Purchase Flow", description: message, userId, severity: "critical", suggestedAction: "موجودی، کیف پول و وضعیت محصول را بررسی کنید.", metadata: { productId, couponCode } });
            }
            throw error;
        }
        admin_service_1.AdminService.invalidateDashboardCache();
        event_bus_service_1.eventBus.emit("order.created", { orderId: result.order.id, userId, productId, totalAmount: result.totalAmount });
        event_bus_service_1.eventBus.emit("order.completed", { orderId: result.order.id, userId, productId, totalAmount: result.totalAmount });
        if (result.couponId && result.couponCode)
            event_bus_service_1.eventBus.emit("coupon.applied", { couponId: result.couponId, code: result.couponCode, userId, orderId: result.order.id, discountAmount: result.discountAmount });
        return result;
    }
    static async assertUserCanPay(userId, tx = prisma_1.prisma) {
        const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true, isBanned: true } });
        if (!user)
            throw new Error("کاربر پیدا نشد");
        if (user.isBanned)
            throw new Error("حساب شما مسدود است و امکان پرداخت وجود ندارد");
        return user;
    }
    static async validateProductForPurchase(userId, productId, expectedAmount, tx = prisma_1.prisma) {
        if (!productId)
            throw new Error("محصول مشخص نیست");
        const setting = await tx.financialSetting.upsert({ where: { id: "singleton" }, update: {}, create: { id: "singleton", minimumTopupAmount: 100000 } });
        if (setting.storeStatus !== "active")
            throw new Error("فروشگاه در حال حاضر غیرفعال است");
        const product = await tx.product.findFirst({ where: { id: productId, AND: [(0, visibility_1.activeProductWhere)(), { category: { is: (0, visibility_1.activeCategoryWhere)() } }] } });
        if (!product)
            throw new Error("محصول پیدا نشد");
        if (expectedAmount !== undefined && product.price !== expectedAmount)
            throw new Error("مبلغ فاکتور با قیمت محصول همخوانی ندارد");
        if (product.mode === "xray_auto" && product.trafficBytes && product.durationDays && product.stockLimit && product.inboundIds.length) {
            if (product.soldCount >= product.stockLimit)
                throw new Error("موجودی این محصول تمام شده است");
        }
        else {
            const stock = await tx.productAccount.count({ where: { AND: [(0, visibility_1.availableInventoryWhere)(productId), (0, visibility_1.unassignedInventoryWhere)()] } });
            if (stock < 1)
                throw new Error("موجودی این محصول تمام شده است");
        }
        return product;
    }
    static async releaseExpiredReservations(timeoutMinutes = 15) {
        const expiresBefore = new Date(Date.now() - timeoutMinutes * 60000);
        const expired = await prisma_1.prisma.productAccount.updateMany({
            where: { status: "reserved", reservedAt: { lt: expiresBefore }, soldTo: null, soldAt: null },
            data: { status: "available", reservedBy: null, reservedAt: null },
        });
        if (expired.count > 0)
            await prisma_1.prisma.auditLog.create({ data: { actorId: "system", action: "Inventory Reservation Released", metadata: JSON.stringify({ count: expired.count, timeoutMinutes }) } });
        return expired.count;
    }
}
exports.PaymentService = PaymentService;
PaymentService.alreadyProcessedMessage = ALREADY_PROCESSED_FA;
class PaymentInvoiceService {
    static async buildXrayRenewalQuote(userId, xrayClientId, productId) {
        return PaymentService.buildXrayRenewalQuote(userId, xrayClientId, productId);
    }
    static async renewXrayWithWallet(userId, xrayClientId, productId) {
        return PaymentService.renewXrayWithWallet(userId, xrayClientId, productId);
    }
    static async createWalletTopupInvoice(userId, amount) {
        return PaymentService.createInvoice({ userId, amount, originalAmount: amount, discountAmount: 0, type: "WALLET_TOPUP" });
    }
    static async createProductInvoice(userId, productId, couponCode) {
        const quote = await prisma_1.prisma.$transaction((tx) => PaymentService.quoteProductInvoice(tx, { userId, productId, couponCode }));
        return PaymentService.createInvoice({
            userId,
            amount: quote.finalAmount,
            originalAmount: quote.originalAmount,
            discountAmount: quote.discountAmount,
            couponId: quote.couponId,
            couponCode: quote.couponCode,
            type: "PRODUCT_PURCHASE",
            productId,
        });
    }
    static async createXrayRenewalInvoice(userId, xrayClientId, productId) {
        return PaymentService.createXrayRenewalInvoice(userId, xrayClientId, productId);
    }
    static async processCallback(reference, metadata = {}) {
        return PaymentService.completePayment(reference, metadata);
    }
    static async markNotification(invoiceId, status, metadata = {}) {
        return PaymentService.markNotification(invoiceId, status, metadata);
    }
    static async list(page = 1, take = 8, status, query) {
        const skip = (Math.max(page, 1) - 1) * take;
        const where = { ...(status ? { status } : {}) };
        if (query)
            where.OR = [{ id: query }, { payId: query }, { user: { is: { telegramId: query } } }];
        return Promise.all([
            prisma_1.prisma.paymentInvoice.findMany({ where, include: { user: true, product: true, coupon: true }, orderBy: { createdAt: "desc" }, skip, take }),
            prisma_1.prisma.paymentInvoice.count({ where }),
        ]);
    }
    static async detail(invoiceId) {
        return prisma_1.prisma.paymentInvoice.findUnique({ where: { id: invoiceId }, include: { user: true, product: true, coupon: true, order: true, audits: { orderBy: { createdAt: "desc" }, take: 20 } } });
    }
    static async stats() {
        const now = new Date();
        const startOfToday = new Date(now);
        startOfToday.setHours(0, 0, 0, 0);
        const startOfWeek = new Date(startOfToday);
        startOfWeek.setDate(startOfWeek.getDate() - 6);
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const revenueWhere = (from) => ({ status: "COMPLETED", completedAt: { gte: from } });
        const [total, successful, paid, failed, pending, cancelled, todayRevenue, weeklyRevenue, monthlyRevenue, recent, gateway] = await Promise.all([
            prisma_1.prisma.paymentInvoice.count(),
            prisma_1.prisma.paymentInvoice.count({ where: { status: "COMPLETED" } }),
            prisma_1.prisma.paymentInvoice.count({ where: { status: "PAID" } }),
            prisma_1.prisma.paymentInvoice.count({ where: { status: "FAILED" } }),
            prisma_1.prisma.paymentInvoice.count({ where: { status: "PENDING" } }),
            prisma_1.prisma.paymentInvoice.count({ where: { status: "CANCELED" } }),
            prisma_1.prisma.paymentInvoice.aggregate({ where: revenueWhere(startOfToday), _sum: { amount: true } }),
            prisma_1.prisma.paymentInvoice.aggregate({ where: revenueWhere(startOfWeek), _sum: { amount: true } }),
            prisma_1.prisma.paymentInvoice.aggregate({ where: revenueWhere(startOfMonth), _sum: { amount: true } }),
            prisma_1.prisma.paymentInvoice.findMany({ include: { user: true, product: true, coupon: true }, orderBy: { createdAt: "desc" }, take: 8 }),
            PaymentGatewayService.getConfig(),
        ]);
        return { total, successful, paid, failed, pending, cancelled, todayRevenue: todayRevenue._sum.amount ?? 0, weeklyRevenue: weeklyRevenue._sum.amount ?? 0, monthlyRevenue: monthlyRevenue._sum.amount ?? 0, recent, gatewayStatus: gateway.lastConnectionStatus ?? "unknown" };
    }
}
exports.PaymentInvoiceService = PaymentInvoiceService;
