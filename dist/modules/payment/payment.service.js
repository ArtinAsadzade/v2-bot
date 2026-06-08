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
const product_service_1 = require("../product/product.service");
const coupon_service_1 = require("../coupon/coupon.service");
const admin_service_1 = require("../admin/admin.service");
const event_bus_service_1 = require("../../services/event-bus.service");
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
const ALREADY_PROCESSED_FA = "Already processed.";
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
    static normalizeInput(input) {
        return {
            enabled: input.enabled,
            apiBaseUrl: input.apiBaseUrl !== undefined ? assertValidHttpUrl(input.apiBaseUrl, "آدرس API درگاه", { normalizeBase: true }) : undefined,
            apiKey: input.apiKey !== undefined ? input.apiKey.trim() : undefined,
            callbackUrl: input.callbackUrl !== undefined ? assertValidHttpUrl(input.callbackUrl, "آدرس callback درگاه") : undefined,
            gatewayName: input.gatewayName !== undefined ? input.gatewayName.trim() : undefined,
            displayOrder: input.displayOrder,
        };
    }
    static async upsertConfig(input, actorId) {
        return prisma_1.prisma.$transaction(async (tx) => {
            this.validateConfig(input, { partial: true });
            const current = await tx.paymentGatewayConfig.upsert({
                where: { id: this.singletonId },
                update: {},
                create: { id: this.singletonId, enabled: false, apiBaseUrl: DEFAULT_GATEWAY_API_BASE_URL, apiKey: "", callbackUrl: "", gatewayName: "پرداخت آنی", displayOrder: 1 },
            });
            const normalized = this.normalizeInput(input);
            const next = {
                enabled: normalized.enabled ?? current.enabled,
                apiBaseUrl: normalized.apiBaseUrl ?? current.apiBaseUrl,
                apiKey: normalized.apiKey ?? current.apiKey,
                callbackUrl: normalized.callbackUrl ?? current.callbackUrl,
                gatewayName: normalized.gatewayName ?? current.gatewayName,
                displayOrder: normalized.displayOrder ?? current.displayOrder,
            };
            this.validateConfig(next);
            await tx.paymentGatewayConfig.update({
                where: { id: this.singletonId },
                data: next,
            });
            await tx.auditLog.create({
                data: {
                    actorId,
                    action: "payment_gateway.config.save",
                    metadata: JSON.stringify({
                        changedFields: Object.keys(input),
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
    static async saveConfig(input, actorId) {
        return this.upsertConfig(input, actorId);
    }
    static async updateConfig(input, actorId) {
        return this.upsertConfig(input, actorId);
    }
    static async update(input, actorId) {
        return this.updateConfig(input, actorId);
    }
    static async setEnabled(enabled, actorId) {
        return this.updateConfig({ enabled }, actorId);
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
    static async createInvoice(data) {
        assertPositiveAmount(data.amount);
        const gateway = await PaymentGatewayService.get();
        if (!gateway.enabled)
            throw new Error("پرداخت آنی در حال حاضر غیرفعال است");
        PaymentGatewayService.validateConfig(gateway);
        await this.assertUserCanPay(data.userId);
        if (data.type === "PRODUCT_PURCHASE")
            await this.validateProductForPurchase(data.userId, data.productId, data.amount);
        const invoice = await prisma_1.prisma.paymentInvoice.create({
            data: { userId: data.userId, amount: data.amount, gatewayAmount: data.amount, callbackToken: crypto_1.default.randomBytes(32).toString("hex"), type: data.type, status: "PENDING", productId: data.productId },
        });
        await audit(prisma_1.prisma, { userId: data.userId, invoiceId: invoice.id, action: "Invoice Created", metadata: { type: data.type, amount: data.amount, status: "PENDING" } });
        const callbackUrl = invoiceCallbackUrl(gateway.callbackUrl, invoice.id);
        await audit(prisma_1.prisma, { userId: data.userId, invoiceId: invoice.id, action: "Gateway Request", metadata: { endpoint: "/invoice/create", price: data.amount, callback_url: callbackUrl } });
        try {
            const gatewayResult = await this.requestGatewayInvoice(gateway, data.amount, callbackUrl);
            await audit(prisma_1.prisma, { userId: data.userId, invoiceId: invoice.id, action: "Gateway Response", metadata: gatewayResult.raw });
            await prisma_1.prisma.paymentGatewayConfig.update({ where: { id: "singleton" }, data: { lastSuccessfulRequest: new Date(), lastConnectionStatus: "success", lastConnectionError: null } });
            return prisma_1.prisma.paymentInvoice.update({ where: { id: invoice.id }, data: { payId: gatewayResult.parsed.payId, paymentLink: gatewayResult.parsed.paymentLink, gatewayAmount: data.amount, gatewayResponse: safeJson(gatewayResult.raw) } });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            await prisma_1.prisma.paymentInvoice.update({ where: { id: invoice.id }, data: { status: "FAILED", gatewayResponse: safeJson({ error: message }) } });
            await prisma_1.prisma.paymentGatewayConfig.update({ where: { id: "singleton" }, data: { lastFailedRequest: new Date(), lastConnectionStatus: "failed", lastConnectionError: message } });
            await audit(prisma_1.prisma, { userId: data.userId, invoiceId: invoice.id, action: "Failed Processing", metadata: { stage: "gateway_create", error: message } });
            throw new Error("ارتباط با درگاه پرداخت برقرار نشد. لطفاً چند دقیقه دیگر دوباره تلاش کنید");
        }
    }
    static async completePayment(invoiceId, metadata = {}) {
        if (!invoiceId)
            return { statusCode: 404, text: "Payment invoice not found." };
        const invoice = await prisma_1.prisma.paymentInvoice.findUnique({ where: { id: invoiceId } });
        if (!invoice)
            return { statusCode: 404, text: "Payment invoice not found." };
        await audit(prisma_1.prisma, { userId: invoice.userId, invoiceId: invoice.id, action: "Callback Received", metadata: { invoice_id: invoiceId, ...metadata } });
        if (invoice.gatewayAmount !== null && invoice.gatewayAmount !== invoice.amount) {
            await audit(prisma_1.prisma, { userId: invoice.userId, invoiceId: invoice.id, action: "Failed Processing", metadata: { stage: "callback_security", reason: "amount_mismatch", gatewayAmount: invoice.gatewayAmount, amount: invoice.amount } });
            return { statusCode: 409, text: "Invoice amount mismatch." };
        }
        if (invoice.status !== "PENDING")
            return { statusCode: 200, text: ALREADY_PROCESSED_FA };
        try {
            const result = await prisma_1.prisma.$transaction(async (tx) => {
                const locked = await tx.paymentInvoice.updateMany({
                    where: { id: invoice.id, status: "PENDING" },
                    data: { status: "PAID", paidAt: new Date(), verifiedAt: new Date() },
                });
                if (locked.count !== 1)
                    return { alreadyProcessed: true };
                const fresh = await tx.paymentInvoice.findUniqueOrThrow({ where: { id: invoice.id } });
                if (fresh.status !== "PAID")
                    return { alreadyProcessed: true };
                await audit(tx, { userId: fresh.userId, invoiceId: fresh.id, action: "Payment Confirmed", metadata: { payId: fresh.payId, amount: fresh.amount } });
                if (fresh.type === "WALLET_TOPUP") {
                    const user = await this.creditWallet(tx, { userId: fresh.userId, amount: fresh.amount, reason: `شارژ کیف پول با پرداخت آنی - فاکتور ${fresh.id}`, actorId: fresh.userId, invoiceId: fresh.id, referenceId: `invoice:${fresh.id}` });
                    const completed = await tx.paymentInvoice.update({ where: { id: fresh.id }, data: { completedAt: new Date(), verifiedAt: new Date() } });
                    return { invoice: completed, user, type: fresh.type };
                }
                const delivered = await this.purchaseProduct(tx, { userId: fresh.userId, productId: fresh.productId ?? "", method: "INSTANT", invoice: fresh });
                const completed = await tx.paymentInvoice.update({ where: { id: fresh.id }, data: { completedAt: new Date(), verifiedAt: new Date(), orderId: delivered.order.id } });
                await audit(tx, { userId: fresh.userId, invoiceId: fresh.id, action: "Order Delivered", metadata: { orderId: delivered.order.id, productId: delivered.product.id, accountId: delivered.account.id } });
                return { invoice: completed, ...delivered, type: fresh.type };
            });
            if ("alreadyProcessed" in result)
                return { statusCode: 200, text: ALREADY_PROCESSED_FA };
            admin_service_1.AdminService.invalidateDashboardCache();
            return { statusCode: 200, text: "Payment completed successfully.", result };
        }
        catch (error) {
            await prisma_1.prisma.paymentInvoice.updateMany({ where: { id: invoice.id, status: { in: ["PENDING", "PAID"] } }, data: { status: "FAILED", verifiedAt: new Date() } });
            await audit(prisma_1.prisma, { userId: invoice.userId, invoiceId: invoice.id, action: "Failed Processing", metadata: { stage: "process", error: error instanceof Error ? error.message : String(error) } });
            return { statusCode: 500, text: "Payment processing failed." };
        }
    }
    static async creditWallet(tx, data) {
        const user = await wallet_service_1.WalletService.credit(data.userId, data.amount, data.reason, tx, { actorId: data.actorId, referenceId: data.referenceId });
        await audit(tx, { userId: data.userId, invoiceId: data.invoiceId, action: "Wallet Credited", actorId: data.actorId, metadata: { amount: data.amount, balance: user.balance, reason: data.reason, referenceId: data.referenceId } });
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
        const product = await this.validateProductForPurchase(data.userId, data.productId, data.invoice?.amount, tx);
        let discountAmount = 0;
        let couponId = null;
        let couponMaxUses = 0;
        const originalAmount = product.price;
        let totalAmount = originalAmount;
        if (data.couponCode) {
            if (data.method !== "WALLET")
                throw new Error("کد تخفیف فقط برای پرداخت با کیف پول پشتیبانی می‌شود");
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
            if (data.invoice.amount !== totalAmount)
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
            await audit(tx, { userId: data.userId, invoiceId: data.invoice?.id, action: "Coupon Used", metadata: { couponId, orderId: order.id, usageSlot, originalAmount, discountAmount, finalAmount: totalAmount } });
        }
        const soldAt = new Date();
        const sold = await tx.productAccount.updateMany({ where: { id: account.id, productId: product.id, status: "reserved", reservedBy: data.userId, AND: [(0, visibility_1.unassignedInventoryWhere)()] }, data: { status: "sold", soldTo: data.userId, soldAt, reservedBy: null, reservedAt: null } });
        if (sold.count !== 1)
            throw new Error("تحویل اکانت ناموفق بود");
        await tx.productAccountHistory.create({ data: { accountId: account.id, actorId: data.userId, action: "Inventory Sold", fromValue: "reserved", toValue: "sold", metadata: JSON.stringify({ invoiceId: data.invoice?.id, orderId: order.id, orderItemId: orderItem.id, productId: product.id, soldAt, expiresAt, method: data.method }) } });
        await audit(tx, { userId: data.userId, invoiceId: data.invoice?.id, action: "Product Purchased", metadata: { productId: product.id, orderId: order.id, accountId: account.id, method: data.method, originalAmount, discountAmount, finalAmount: totalAmount } });
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
        return PaymentService.createInvoice({ userId, amount, type: "WALLET_TOPUP" });
    }
    static async createProductInvoice(userId, productId) {
        const product = await product_service_1.ProductService.getProduct(productId);
        if (!product)
            throw new Error("محصول پیدا نشد");
        return PaymentService.createInvoice({ userId, amount: product.price, type: "PRODUCT_PURCHASE", productId });
    }
    static async processCallback(invoiceId, metadata = {}) {
        return PaymentService.completePayment(invoiceId, metadata);
    }
    static async list(page = 1, take = 8, status, query) {
        const skip = (Math.max(page, 1) - 1) * take;
        const where = { ...(status ? { status } : {}) };
        if (query)
            where.OR = [{ id: query }, { payId: query }, { user: { is: { telegramId: query } } }];
        return Promise.all([
            prisma_1.prisma.paymentInvoice.findMany({ where, include: { user: true, product: true }, orderBy: { createdAt: "desc" }, skip, take }),
            prisma_1.prisma.paymentInvoice.count({ where }),
        ]);
    }
    static async detail(invoiceId) {
        return prisma_1.prisma.paymentInvoice.findUnique({ where: { id: invoiceId }, include: { user: true, product: true, order: true, audits: { orderBy: { createdAt: "desc" }, take: 20 } } });
    }
    static async stats() {
        const [successful, failed, pending, recent] = await Promise.all([
            prisma_1.prisma.paymentInvoice.count({ where: { status: { in: ["PAID", "COMPLETED"] } } }),
            prisma_1.prisma.paymentInvoice.count({ where: { status: "FAILED" } }),
            prisma_1.prisma.paymentInvoice.count({ where: { status: "PENDING" } }),
            prisma_1.prisma.paymentInvoice.findMany({ include: { user: true, product: true }, orderBy: { createdAt: "desc" }, take: 5 }),
        ]);
        return { successful, failed, pending, recent };
    }
}
exports.PaymentInvoiceService = PaymentInvoiceService;
