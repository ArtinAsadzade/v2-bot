"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentInvoiceService = exports.PaymentService = exports.PaymentGatewayService = void 0;
exports.maskApiKey = maskApiKey;
const crypto_1 = __importDefault(require("crypto"));
const prisma_1 = require("../../services/prisma");
const wallet_service_1 = require("../wallet/wallet.service");
const coupon_service_1 = require("../coupon/coupon.service");
const admin_service_1 = require("../admin/admin.service");
const event_bus_service_1 = require("../../services/event-bus.service");
const logger_1 = require("../../services/logger");
const visibility_1 = require("../product/visibility");
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
const CALLBACK_TOKEN_PARAM = "invoice_id";
const ALREADY_PROCESSED_FA = "⚠️ این پرداخت قبلاً پردازش شده است.";
const DEFAULT_GATEWAY_API_BASE_URL = "http://136.244.104.77:5000/api/v1";
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
function invoiceCallbackUrl(baseCallbackUrl, invoiceId) {
    const withId = baseCallbackUrl.includes("{invoiceId}") ? baseCallbackUrl.split("{invoiceId}").join(encodeURIComponent(invoiceId)) : baseCallbackUrl;
    const url = new URL(withId);
    url.searchParams.set(CALLBACK_TOKEN_PARAM, invoiceId);
    return url.toString();
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
async function audit(tx, data) {
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
        const callbackUrl = invoiceCallbackUrl(gateway.callbackUrl, `test-${Date.now()}`);
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
            const coupon = await coupon_service_1.CouponService.validateForUser(data.couponCode, data.userId, tx, originalAmount);
            const calculation = coupon_service_1.CouponService.calculate(coupon, originalAmount);
            couponId = coupon.id;
            couponCode = coupon.code;
            discountAmount = calculation.discountAmount;
            finalAmount = calculation.finalAmount;
        }
        assertPositiveAmount(finalAmount);
        return { originalAmount, discountAmount, finalAmount, couponId, couponCode };
    }
    static assertInvoiceAmountIntegrity(invoice) {
        const expectedAmount = invoice.originalAmount > 0 ? invoice.originalAmount - invoice.discountAmount : invoice.amount;
        if (expectedAmount !== invoice.amount)
            return { ok: false, reason: "stored_final_amount_mismatch", expectedAmount };
        if (invoice.gatewayAmount !== null && invoice.gatewayAmount !== invoice.amount)
            return { ok: false, reason: "gateway_amount_mismatch", expectedAmount };
        return { ok: true, expectedAmount };
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
        const invoice = await prisma_1.prisma.paymentInvoice.create({
            data: {
                userId: data.userId,
                amount: data.amount,
                originalAmount,
                discountAmount,
                couponId: data.couponId ?? undefined,
                couponCode: data.couponCode ?? undefined,
                gatewayAmount: data.amount,
                callbackToken: crypto_1.default.randomBytes(32).toString("hex"),
                type: data.type,
                status: "PENDING",
                productId: data.productId,
            },
        });
        paymentLog("PAYMENT_INVOICE_CREATED", { invoiceId: invoice.id, userId: data.userId, type: data.type, amount: data.amount, status: "PENDING" });
        await audit(prisma_1.prisma, { userId: data.userId, invoiceId: invoice.id, action: "PAYMENT_INVOICE_CREATED", metadata: { type: data.type, originalAmount, discountAmount, finalAmount: data.amount, couponId: data.couponId, couponCode: data.couponCode, status: "PENDING" } });
        if (data.couponId)
            await audit(prisma_1.prisma, { userId: data.userId, invoiceId: invoice.id, action: "COUPON_APPLIED", metadata: { couponId: data.couponId, couponCode: data.couponCode, originalAmount, discountAmount, finalAmount: data.amount, usageRecorded: false } });
        const callbackUrl = invoiceCallbackUrl(gateway.callbackUrl, invoice.id);
        paymentLog("PAYMENT_GATEWAY_REQUEST", { invoiceId: invoice.id, userId: data.userId, endpoint: "/invoice/create", price: data.amount, callbackUrl });
        await audit(prisma_1.prisma, { userId: data.userId, invoiceId: invoice.id, action: "PAYMENT_GATEWAY_REQUEST", metadata: { endpoint: "/invoice/create", price: data.amount, callback_url: callbackUrl } });
        try {
            const gatewayResult = await this.requestGatewayInvoice(gateway, data.amount, callbackUrl);
            paymentLog("PAYMENT_GATEWAY_RESPONSE", { invoiceId: invoice.id, userId: data.userId, payId: gatewayResult.parsed.payId });
            await audit(prisma_1.prisma, { userId: data.userId, invoiceId: invoice.id, action: "PAYMENT_GATEWAY_RESPONSE", metadata: gatewayResult.raw });
            await prisma_1.prisma.paymentGatewayConfig.update({ where: { id: "singleton" }, data: { lastSuccessfulRequest: new Date(), lastConnectionStatus: "success", lastConnectionError: null } });
            return prisma_1.prisma.paymentInvoice.update({ where: { id: invoice.id }, data: { payId: gatewayResult.parsed.payId, paymentLink: gatewayResult.parsed.paymentLink, gatewayAmount: data.amount, gatewayResponse: safeJson(gatewayResult.raw) } });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            paymentLog("PAYMENT_PROCESS_FAILED", { invoiceId: invoice.id, userId: data.userId, stage: "gateway_create", error: message });
            await prisma_1.prisma.paymentInvoice.update({ where: { id: invoice.id }, data: { status: "FAILED", gatewayResponse: safeJson({ error: message }), deliveryStatus: "FAILED" } });
            await prisma_1.prisma.paymentGatewayConfig.update({ where: { id: "singleton" }, data: { lastFailedRequest: new Date(), lastConnectionStatus: "failed", lastConnectionError: message } });
            await audit(prisma_1.prisma, { userId: data.userId, invoiceId: invoice.id, action: "PAYMENT_PROCESS_FAILED", metadata: { stage: "gateway_create", error: message } });
            throw new Error("ارتباط با درگاه پرداخت برقرار نشد. لطفاً چند دقیقه دیگر دوباره تلاش کنید");
        }
    }
    static async completePayment(invoiceId, metadata = {}) {
        if (!invoiceId)
            return { statusCode: 404, text: "Payment invoice not found." };
        const invoice = await prisma_1.prisma.paymentInvoice.findUnique({ where: { id: invoiceId } });
        if (!invoice)
            return { statusCode: 404, text: "Payment invoice not found." };
        const callbackAt = new Date();
        await prisma_1.prisma.paymentInvoice.update({ where: { id: invoice.id }, data: { callbackCount: { increment: 1 }, lastCallbackAt: callbackAt } });
        paymentLog("PAYMENT_CALLBACK_RECEIVED", { invoiceId: invoice.id, userId: invoice.userId, status: invoice.status, callbackAt: callbackAt.toISOString(), query: metadata.query });
        await audit(prisma_1.prisma, { userId: invoice.userId, invoiceId: invoice.id, action: "PAYMENT_CALLBACK_RECEIVED", metadata: { invoice_id: invoiceId, ...metadata } });
        const integrity = this.assertInvoiceAmountIntegrity(invoice);
        if (!integrity.ok) {
            const failed = await prisma_1.prisma.paymentInvoice.updateMany({ where: { id: invoice.id, status: "PENDING" }, data: { status: "FAILED", verifiedAt: new Date(), deliveryStatus: "FAILED" } });
            paymentLog("PAYMENT_PROCESS_FAILED", { invoiceId: invoice.id, userId: invoice.userId, stage: "callback_security", reason: integrity.reason, statusChanged: failed.count === 1 });
            await audit(prisma_1.prisma, { userId: invoice.userId, invoiceId: invoice.id, action: "PAYMENT_PROCESS_FAILED", metadata: { stage: "callback_security", reason: integrity.reason, gatewayAmount: invoice.gatewayAmount, amount: invoice.amount, originalAmount: invoice.originalAmount, discountAmount: invoice.discountAmount, amountExpected: integrity.expectedAmount } });
            return { statusCode: 409, text: "Invoice amount mismatch.", failed: { invoice: { ...invoice, status: failed.count === 1 ? "FAILED" : invoice.status }, type: invoice.type } };
        }
        paymentLog("PAYMENT_CALLBACK_PROCESSING", { invoiceId: invoice.id, userId: invoice.userId, status: invoice.status, type: invoice.type });
        await audit(prisma_1.prisma, { userId: invoice.userId, invoiceId: invoice.id, action: "PAYMENT_CALLBACK_PROCESSING", metadata: { status: invoice.status, type: invoice.type, payId: invoice.payId } });
        if (invoice.status === "COMPLETED")
            return { statusCode: 200, text: ALREADY_PROCESSED_FA };
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
        }
        const staleProcessingBefore = new Date(Date.now() - 5 * 60000);
        const fulfillmentLock = await prisma_1.prisma.paymentInvoice.updateMany({
            where: { id: paidInvoice.id, status: "PAID", OR: [{ deliveryStatus: null }, { deliveryStatus: { in: ["PENDING", "FAILED"] } }, { deliveryStatus: "PROCESSING", updatedAt: { lt: staleProcessingBefore } }] },
            data: { deliveryStatus: "PROCESSING" },
        });
        if (fulfillmentLock.count !== 1)
            return { statusCode: 200, text: ALREADY_PROCESSED_FA };
        try {
            const result = await this.fulfillPaidInvoice(paidInvoice.id);
            admin_service_1.AdminService.invalidateDashboardCache();
            return { statusCode: 200, text: "Payment completed successfully.", result };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            paymentLog("PAYMENT_PROCESS_FAILED", { invoiceId: paidInvoice.id, userId: paidInvoice.userId, stage: "fulfillment", error: message });
            await prisma_1.prisma.paymentInvoice.update({ where: { id: paidInvoice.id }, data: { deliveryStatus: "FAILED", verifiedAt: new Date() } });
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
            if (fresh.type === "WALLET_TOPUP") {
                const user = await this.creditWallet(tx, { userId: fresh.userId, amount: fresh.amount, reason: `شارژ کیف پول با پرداخت آنی - فاکتور ${fresh.id}`, actorId: fresh.userId, invoiceId: fresh.id, referenceId: `invoice:${fresh.id}` });
                const completed = await tx.paymentInvoice.update({ where: { id: fresh.id }, data: { status: "COMPLETED", completedAt: new Date(), verifiedAt: new Date(), deliveryStatus: "COMPLETED" } });
                paymentLog("PAYMENT_WALLET_CREDITED", { invoiceId: fresh.id, userId: fresh.userId, amount: fresh.amount, balance: user.balance });
                await audit(tx, { userId: fresh.userId, invoiceId: fresh.id, action: "PAYMENT_WALLET_CREDITED", metadata: { amount: fresh.amount, balance: user.balance } });
                await audit(tx, { userId: fresh.userId, invoiceId: fresh.id, action: "PAYMENT_INVOICE_COMPLETED", metadata: { amount: fresh.amount, type: fresh.type } });
                return { invoice: completed, user, type: fresh.type };
            }
            if (fresh.orderId) {
                const existingOrder = await tx.order.findUnique({ where: { id: fresh.orderId }, include: { product: true, items: { include: { productAccount: true }, take: 1 } } });
                if (existingOrder?.items[0]) {
                    const completed = await tx.paymentInvoice.update({ where: { id: fresh.id }, data: { status: "COMPLETED", completedAt: fresh.completedAt ?? new Date(), verifiedAt: new Date(), deliveryStatus: "COMPLETED" } });
                    return { invoice: completed, order: existingOrder, product: existingOrder.product, account: existingOrder.items[0].productAccount, orderItem: existingOrder.items[0], type: fresh.type };
                }
            }
            const delivered = await this.purchaseProduct(tx, { userId: fresh.userId, productId: fresh.productId ?? "", couponCode: fresh.couponCode ?? undefined, method: "INSTANT", invoice: fresh });
            const completed = await tx.paymentInvoice.update({ where: { id: fresh.id }, data: { status: "COMPLETED", completedAt: new Date(), verifiedAt: new Date(), orderId: delivered.order.id, deliveryStatus: "COMPLETED" } });
            paymentLog("PAYMENT_PRODUCT_DELIVERED", { invoiceId: fresh.id, userId: fresh.userId, orderId: delivered.order.id, productId: delivered.product.id, accountId: delivered.account.id });
            await audit(tx, { userId: fresh.userId, invoiceId: fresh.id, action: "PAYMENT_PRODUCT_DELIVERED", metadata: { orderId: delivered.order.id, productId: delivered.product.id, accountId: delivered.account.id } });
            await audit(tx, { userId: fresh.userId, invoiceId: fresh.id, action: "PAYMENT_INVOICE_COMPLETED", metadata: { orderId: delivered.order.id, amount: fresh.amount, type: fresh.type } });
            return { invoice: completed, ...delivered, type: fresh.type };
        });
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
        if (data.couponCode) {
            if (data.method === "INSTANT" && !data.invoice)
                throw new Error("کد تخفیف برای پرداخت آنی فقط از مسیر فاکتور معتبر است");
            const coupon = await coupon_service_1.CouponService.validateForUser(data.couponCode, data.userId, tx, originalAmount);
            couponId = coupon.id;
            couponMaxUses = coupon.maxUses;
            const calculation = coupon_service_1.CouponService.calculate(coupon, originalAmount);
            discountAmount = calculation.discountAmount;
            totalAmount = calculation.finalAmount;
        }
        if (data.invoice) {
            if (data.invoice.userId !== data.userId || data.invoice.productId !== data.productId)
                throw new Error("فاکتور با خرید همخوانی ندارد");
            if (data.invoice.amount !== totalAmount || data.invoice.originalAmount !== originalAmount || data.invoice.discountAmount !== discountAmount || (data.invoice.couponId ?? null) !== couponId)
                throw new Error("مبلغ فاکتور با مبلغ خرید همخوانی ندارد");
            if (data.invoice.status !== "PAID")
                throw new Error("پرداخت تایید نشده است");
        }
        const account = await tx.productAccount.findFirst({ where: { AND: [(0, visibility_1.availableInventoryWhere)(product.id), (0, visibility_1.unassignedInventoryWhere)()] }, orderBy: { createdAt: "asc" } });
        if (!account)
            throw new Error("موجودی این محصول تمام شده است");
        const reservedAt = new Date();
        const reserved = await tx.productAccount.updateMany({ where: { id: account.id, AND: [(0, visibility_1.availableInventoryWhere)(product.id), (0, visibility_1.unassignedInventoryWhere)()] }, data: { status: "reserved", reservedBy: data.userId, reservedAt } });
        if (reserved.count !== 1)
            throw new Error("این اکانت هم‌اکنون رزرو شد؛ دوباره تلاش کنید");
        await tx.productAccountHistory.create({ data: { accountId: account.id, actorId: data.userId, action: "Inventory Reserved", fromValue: "available", toValue: "reserved", metadata: JSON.stringify({ invoiceId: data.invoice?.id, productId: product.id, reservedAt, method: data.method }) } });
        await audit(tx, { userId: data.userId, invoiceId: data.invoice?.id, action: "Inventory Reserved", metadata: { accountId: account.id, productId: product.id, method: data.method } });
        if (data.method === "WALLET" && totalAmount > 0) {
            await this.debitWallet(tx, { userId: data.userId, amount: totalAmount, reason: `خرید محصول ${product.title}`, actorId: data.userId, referenceId: `purchase:${data.userId}:${product.id}:${reservedAt.getTime()}` });
        }
        if (couponId) {
            const couponUpdated = await tx.coupon.updateMany({ where: { id: couponId, status: "active", deletedAt: null, usedCount: { lt: couponMaxUses }, expiresAt: { gt: new Date() } }, data: { usedCount: { increment: 1 } } });
            if (couponUpdated.count !== 1)
                throw new Error("کد تخفیف دیگر قابل استفاده نیست");
        }
        const order = await tx.order.create({ data: { userId: data.userId, productId: product.id, couponId, originalAmount, totalAmount, finalPaidAmount: totalAmount, discountAmount, status: "completed" } });
        const purchaseDate = new Date();
        const durationDays = account.durationDays ?? product.duration;
        const expiresAt = new Date(purchaseDate.getTime() + durationDays * 86400000);
        const orderItem = await tx.orderItem.create({ data: { orderId: order.id, productId: product.id, productAccountId: account.id, deliveredUsername: account.username, deliveredPassword: account.password, deliveredSubscriptionLink: account.subscriptionLink, deliveredConfigLink: account.configLink, deliveredConfig: account.configLink || account.config, purchaseDate, expiresAt, isActive: true } });
        if (couponId) {
            const usageSlot = await tx.couponUsage.count({ where: { couponId, userId: data.userId } });
            if (usageSlot >= (await tx.coupon.findUniqueOrThrow({ where: { id: couponId }, select: { perUserLimit: true } })).perUserLimit)
                throw new Error("سقف استفاده شما از این کد تخفیف تکمیل شده است");
            await tx.couponUsage.create({ data: { couponId, userId: data.userId, orderId: order.id, usageSlot } });
            await audit(tx, { userId: data.userId, invoiceId: data.invoice?.id, action: "COUPON_USAGE_RECORDED", metadata: { couponId, orderId: order.id, usageSlot, originalAmount, discountAmount, finalAmount: totalAmount } });
        }
        const soldAt = new Date();
        const sold = await tx.productAccount.updateMany({ where: { id: account.id, productId: product.id, status: "reserved", reservedBy: data.userId, AND: [(0, visibility_1.unassignedInventoryWhere)()] }, data: { status: "sold", soldTo: data.userId, soldAt, reservedBy: null, reservedAt: null } });
        if (sold.count !== 1)
            throw new Error("تحویل اکانت ناموفق بود");
        await tx.productAccountHistory.create({ data: { accountId: account.id, actorId: data.userId, action: "Inventory Sold", fromValue: "reserved", toValue: "sold", metadata: JSON.stringify({ invoiceId: data.invoice?.id, orderId: order.id, orderItemId: orderItem.id, productId: product.id, soldAt, expiresAt, method: data.method }) } });
        await audit(tx, { userId: data.userId, invoiceId: data.invoice?.id, action: "PRODUCT_DELIVERED", metadata: { productId: product.id, orderId: order.id, accountId: account.id, method: data.method, originalAmount, discountAmount, finalAmount: totalAmount } });
        await audit(tx, { userId: data.userId, invoiceId: data.invoice?.id, action: "Inventory Sold", metadata: { accountId: account.id, orderId: order.id } });
        const deliveredAccount = await tx.productAccount.findUniqueOrThrow({ where: { id: account.id } });
        return { order, product, account: deliveredAccount, orderItem, totalAmount, originalAmount, discountAmount, couponId, couponCode: data.couponCode, expiresAt };
    }
    static async purchaseProductWithWallet(userId, productId, couponCode) {
        const result = await prisma_1.prisma.$transaction((tx) => this.purchaseProduct(tx, { userId, productId, couponCode, method: "WALLET" }));
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
        const stock = await tx.productAccount.count({ where: { AND: [(0, visibility_1.availableInventoryWhere)(productId), (0, visibility_1.unassignedInventoryWhere)()] } });
        if (stock < 1)
            throw new Error("موجودی این محصول تمام شده است");
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
    static async processCallback(invoiceId, metadata = {}) {
        return PaymentService.completePayment(invoiceId, metadata);
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
        const [successful, failed, pending, recent] = await Promise.all([
            prisma_1.prisma.paymentInvoice.count({ where: { status: { in: ["PAID", "COMPLETED"] } } }),
            prisma_1.prisma.paymentInvoice.count({ where: { status: "FAILED" } }),
            prisma_1.prisma.paymentInvoice.count({ where: { status: "PENDING" } }),
            prisma_1.prisma.paymentInvoice.findMany({ include: { user: true, product: true, coupon: true }, orderBy: { createdAt: "desc" }, take: 5 }),
        ]);
        return { successful, failed, pending, recent };
    }
}
exports.PaymentInvoiceService = PaymentInvoiceService;
