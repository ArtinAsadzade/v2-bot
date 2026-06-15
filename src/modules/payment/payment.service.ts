import crypto from "crypto";
import type { Prisma, PaymentInvoice } from "@prisma/client";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import { PaymentInvoiceStatus, PaymentInvoiceType } from "@prisma/client";
import { prisma } from "../../services/prisma";
import { WalletService } from "../wallet/wallet.service";
import { CouponService, normalizeCouponCode } from "../coupon/coupon.service";
import { AdminService } from "../admin/admin.service";
import { eventBus } from "../../services/event-bus.service";
import { logger } from "../../services/logger";
import { MonitoringService } from "../../services/monitoring.service";
import { activeCategoryWhere, activeProductWhere, availableInventoryWhere, unassignedInventoryWhere } from "../product/visibility";
import { XrayClientService, sanitizePanelError, xrayTrafficSnapshot } from "../xray/xray.service";

export type PaymentGatewayInput = {
  enabled?: boolean;
  apiBaseUrl?: string;
  apiKey?: string;
  callbackUrl?: string;
  gatewayName?: string;
  displayOrder?: number;
};

type TxClient = Prisma.TransactionClient;
type DbClient = TxClient | typeof prisma;

type AuditData = { userId?: string | null; invoiceId?: string | null; action: string; metadata?: Record<string, unknown>; actorId?: string };

type PurchaseMethod = "WALLET" | "INSTANT";

type ProductInvoiceQuote = {
  originalAmount: number;
  discountAmount: number;
  finalAmount: number;
  couponId: string | null;
  couponCode: string | null;
};

class GatewayHttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

class GatewayConnectionError extends Error {
  constructor(message: string) {
    super(message);
  }
}

class DuplicateGatewayPayIdError extends Error {
  constructor(public readonly payId: string, public readonly existingInvoiceId: string) {
    super("شناسه پرداخت تکراری از درگاه دریافت شد");
  }
}

const CALLBACK_TOKEN_PARAM = "token";
const CALLBACK_INVOICE_PARAM = "invoice_id";
const ALREADY_PROCESSED_FA = "⚠️ این پرداخت قبلاً پردازش شده است.";
const DEFAULT_GATEWAY_API_BASE_URL = "http://136.244.104.77:5000/api/v1";
function slugify(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "svc"; }

function assertPositiveAmount(amount: number) {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error("مبلغ پرداخت معتبر نیست");
}

function normalizeBaseUrl(url: string) {
  return url.trim().replace(/\/+$/, "");
}

function localGatewayUrlsAllowed() {
  return process.env.PAYMENT_GATEWAY_ALLOW_LOCAL_URLS === "true";
}

function isLocalHostname(hostname: string) {
  const normalized = hostname.toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1" || normalized.endsWith(".localhost");
}

function assertValidHttpUrl(value: string, label: string, options: { normalizeBase?: boolean } = {}) {
  const raw = value.trim();
  if (!raw) throw new Error(`${label} الزامی است`);
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`${label} معتبر نیست`);
  }
  if (!/^https?:$/.test(parsed.protocol)) throw new Error(`${label} معتبر نیست`);
  if (!parsed.hostname || parsed.hostname.length < 3) throw new Error(`${label} معتبر نیست`);
  if (isLocalHostname(parsed.hostname) && !localGatewayUrlsAllowed()) throw new Error(`${label} localhost مجاز نیست`);
  if (!localGatewayUrlsAllowed() && !parsed.hostname.includes(".") && !/^\d+\.\d+\.\d+\.\d+$/.test(parsed.hostname)) throw new Error(`${label} معتبر نیست`);
  return options.normalizeBase ? normalizeBaseUrl(parsed.toString()) : parsed.toString();
}

function validateUrl(value: string, label: string) {
  assertValidHttpUrl(value, label);
}

function parseGatewayResponse(body: unknown) {
  if (!body || typeof body !== "object") throw new Error("پاسخ درگاه معتبر نیست");
  const data = body as Record<string, unknown>;
  if (String(data.status ?? "").toLowerCase() !== "true") throw new Error(String(data.message ?? "درگاه ایجاد فاکتور را تأیید نکرد"));
  const payId = String(data.pay_id ?? "").trim();
  const paymentLink = String(data.payment_link ?? "").trim();
  if (!payId || !paymentLink) throw new Error("شناسه یا لینک پرداخت از درگاه دریافت نشد");
  validateUrl(paymentLink, "لینک پرداخت");
  return { payId, paymentLink };
}

function invoiceCallbackUrl(baseCallbackUrl: string, data: { invoiceId: string; callbackToken: string }) {
  const withId = baseCallbackUrl.includes("{invoiceId}") ? baseCallbackUrl.split("{invoiceId}").join(encodeURIComponent(data.invoiceId)) : baseCallbackUrl;
  const withToken = withId.includes("{token}") ? withId.split("{token}").join(encodeURIComponent(data.callbackToken)) : withId;
  const url = new URL(withToken);
  url.searchParams.set(CALLBACK_INVOICE_PARAM, data.invoiceId);
  url.searchParams.set(CALLBACK_TOKEN_PARAM, data.callbackToken);
  return url.toString();
}

function isValidObjectId(value: string) {
  return /^[a-f\d]{24}$/i.test(value);
}


async function rawPaymentInvoiceProjection(invoiceId: string) {
  try {
    const result = await prisma.$runCommandRaw({
      find: "PaymentInvoice",
      filter: { _id: { $oid: invoiceId } },
      projection: { _id: 1, status: 1, payId: 1 },
      limit: 1,
    });
    const cursor = result && typeof result === "object" && "cursor" in result ? (result as { cursor?: { firstBatch?: unknown[] } }).cursor : undefined;
    const document = cursor?.firstBatch?.[0];
    return document && typeof document === "object" ? (document as Record<string, unknown>) : null;
  } catch (error) {
    paymentLog("PAYMENT_INVOICE_RAW_PROJECTION_FAILED", { invoiceId, error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

type CallbackReference = { token?: string; invoice?: string; invoice_id?: string; pay_id?: string };

function normalizeCallbackReference(reference: string | CallbackReference) {
  if (typeof reference === "string") return { invoice_id: reference.trim() };
  return {
    token: reference.token?.trim(),
    invoice: reference.invoice?.trim(),
    invoice_id: reference.invoice_id?.trim(),
    pay_id: reference.pay_id?.trim(),
  };
}


function metadataAmount(metadata: Record<string, unknown>) {
  const query = metadata.query && typeof metadata.query === "object" ? (metadata.query as Record<string, unknown>) : {};
  for (const key of ["amount", "price", "paid_amount", "gatewayAmount"]) {
    const raw = metadata[key] ?? query[key];
    if (raw === undefined || raw === null || raw === "") continue;
    const value = typeof raw === "number" ? raw : Number(String(raw).replace(/[,،\s]/g, ""));
    if (Number.isInteger(value) && value > 0) return value;
  }
  return undefined;
}

function safeJson(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({ error: "unserializable" });
  }
}

export function maskApiKey(apiKey?: string | null) {
  if (!apiKey) return "ثبت نشده";
  const suffix = apiKey.slice(-4).toUpperCase();
  return `********${suffix}`;
}

function paymentLog(event: string, metadata: Record<string, unknown> = {}) {
  logger.info(event, { event, ...metadata });
}

function xrayClientEmail(input: { telegramId: string; productId: string; orderId: string }) {
  return `tg${input.telegramId}-p${input.productId.slice(-8)}-o${input.orderId.slice(-8)}`.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 64);
}

async function audit(tx: DbClient, data: AuditData) {
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
  } catch (error) {
    logger.error("PAYMENT_AUDIT_LOG_FAILED", {
      event: "PAYMENT_AUDIT_LOG_FAILED",
      action: data.action,
      invoiceId: data.invoiceId,
      userId: data.userId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export class PaymentGatewayService {
  private static readonly singletonId = "singleton";

  static async getConfig() {
    return prisma.$transaction(async (tx) => {
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

  static validateConfig(input: PaymentGatewayInput & { enabled?: boolean }, options: { partial?: boolean } = {}) {
    if (input.apiBaseUrl !== undefined && (options.partial || input.apiBaseUrl.trim())) assertValidHttpUrl(input.apiBaseUrl, "آدرس API درگاه", { normalizeBase: true });
    if (input.callbackUrl !== undefined && (options.partial || input.callbackUrl.trim())) assertValidHttpUrl(input.callbackUrl, "آدرس callback درگاه");
    if (options.partial && input.apiKey !== undefined && !input.apiKey.trim()) throw new Error("کلید API درگاه الزامی است");
    if (input.gatewayName !== undefined && !input.gatewayName.trim()) throw new Error("نام درگاه الزامی است");
    if (input.displayOrder !== undefined && (!Number.isInteger(input.displayOrder) || input.displayOrder < 1)) throw new Error("ترتیب نمایش معتبر نیست");

    if (!options.partial && input.enabled) {
      if (!input.apiBaseUrl?.trim()) throw new Error("آدرس API درگاه الزامی است");
      if (!input.apiKey?.trim()) throw new Error("کلید API درگاه الزامی است");
      if (!input.callbackUrl?.trim()) throw new Error("آدرس callback درگاه الزامی است");
      assertValidHttpUrl(input.apiBaseUrl, "آدرس API درگاه", { normalizeBase: true });
      assertValidHttpUrl(input.callbackUrl, "آدرس callback درگاه");
    }
  }

  private static validateField<K extends keyof PaymentGatewayInput>(field: K, value: PaymentGatewayInput[K]) {
    if (field === "apiBaseUrl") return assertValidHttpUrl(String(value ?? ""), "آدرس API درگاه", { normalizeBase: true });
    if (field === "callbackUrl") return assertValidHttpUrl(String(value ?? ""), "آدرس callback درگاه");
    if (field === "apiKey") {
      const apiKey = String(value ?? "").trim();
      if (!apiKey) throw new Error("کلید API درگاه الزامی است");
      if (apiKey.length < 8) throw new Error("کلید API درگاه کوتاه است");
      return apiKey;
    }
    if (field === "gatewayName") {
      const gatewayName = String(value ?? "").trim();
      if (!gatewayName) throw new Error("نام درگاه الزامی است");
      return gatewayName;
    }
    if (field === "displayOrder") {
      const displayOrder = Number(value);
      if (!Number.isInteger(displayOrder) || displayOrder < 1) throw new Error("ترتیب نمایش معتبر نیست");
      return displayOrder;
    }
    if (field === "enabled") return Boolean(value);
    throw new Error("فیلد تنظیمات درگاه معتبر نیست");
  }

  static validateConfigField<K extends keyof PaymentGatewayInput>(field: K, value: PaymentGatewayInput[K]) {
    return this.validateField(field, value);
  }

  private static normalizeInput(input: PaymentGatewayInput) {
    const normalized: PaymentGatewayInput = {};
    for (const field of Object.keys(input) as (keyof PaymentGatewayInput)[]) {
      const value = input[field];
      if (value === undefined) continue;
      normalized[field] = this.validateField(field, value) as never;
    }
    return normalized;
  }

  private static async ensureConfig(tx: TxClient) {
    return tx.paymentGatewayConfig.upsert({
      where: { id: this.singletonId },
      update: {},
      create: { id: this.singletonId, enabled: false, apiBaseUrl: DEFAULT_GATEWAY_API_BASE_URL, apiKey: "", callbackUrl: "", gatewayName: "پرداخت آنی", displayOrder: 1 },
    });
  }

  private static assertCanEnable(config: PaymentGatewayInput) {
    this.validateConfig({ ...config, enabled: true });
  }

  static async upsertConfig(input: PaymentGatewayInput, actorId: string) {
    return prisma.$transaction(async (tx) => {
      const current = await this.ensureConfig(tx);
      const normalized = this.normalizeInput(input);
      const next = { ...current, ...normalized };
      if (normalized.enabled === true) this.assertCanEnable(next);

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

  static async updateConfigField<K extends keyof PaymentGatewayInput>(field: K, value: PaymentGatewayInput[K], actorId: string) {
    return prisma.$transaction(async (tx) => {
      const current = await this.ensureConfig(tx);
      const normalizedValue = this.validateField(field, value);
      const data = { [field]: normalizedValue } as Prisma.PaymentGatewayConfigUpdateInput;
      const next = { ...current, [field]: normalizedValue };
      if (field === "enabled" && normalizedValue === true) this.assertCanEnable(next);
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

  static async saveConfig(input: PaymentGatewayInput, actorId: string) {
    return this.upsertConfig(input, actorId);
  }

  static async updateConfig(input: PaymentGatewayInput, actorId: string) {
    const fields = Object.keys(input).filter((field) => input[field as keyof PaymentGatewayInput] !== undefined) as (keyof PaymentGatewayInput)[];
    if (fields.length === 1) return this.updateConfigField(fields[0], input[fields[0]], actorId);
    return this.upsertConfig(input, actorId);
  }

  static async update(input: PaymentGatewayInput, actorId: string) {
    return this.updateConfig(input, actorId);
  }

  static async setEnabled(enabled: boolean, actorId: string) {
    return this.updateConfigField("enabled", enabled, actorId);
  }

  private static connectionFailureMessage(error: unknown) {
    if (error instanceof GatewayHttpError && error.status === 401) return "API Key نامعتبر است";
    if (error instanceof GatewayConnectionError) return "سرور درگاه در دسترس نیست";
    return error instanceof Error ? error.message : String(error);
  }

  static async testConnection(actorId: string) {
    const gateway = await this.getConfig();
    this.validateConfig({ ...gateway, enabled: true });
    const callbackUrl = invoiceCallbackUrl(gateway.callbackUrl, { invoiceId: `test-${Date.now()}`, callbackToken: crypto.randomBytes(16).toString("hex") });
    try {
      const { parsed, raw } = await PaymentService.requestGatewayInvoice(gateway, 1_000, callbackUrl);
      const reloaded = await prisma.$transaction(async (tx) => {
        await tx.paymentGatewayConfig.update({ where: { id: this.singletonId }, data: { lastSuccessfulRequest: new Date(), lastConnectionStatus: "success", lastConnectionError: null } });
        await tx.auditLog.create({ data: { actorId, action: "payment_gateway.connection_test.success", metadata: JSON.stringify({ payId: parsed.payId, status: "success" }) } });
        return tx.paymentGatewayConfig.findUniqueOrThrow({ where: { id: this.singletonId } });
      });
      return { ok: true as const, message: "✅ اتصال با موفقیت برقرار شد", details: raw, config: reloaded };
    } catch (error) {
      const message = this.connectionFailureMessage(error);
      const reloaded = await prisma.$transaction(async (tx) => {
        await tx.paymentGatewayConfig.update({ where: { id: this.singletonId }, data: { lastFailedRequest: new Date(), lastConnectionStatus: "failed", lastConnectionError: message } });
        await tx.auditLog.create({ data: { actorId, action: "payment_gateway.connection_test.failed", metadata: JSON.stringify({ error: message }) } });
        return tx.paymentGatewayConfig.findUniqueOrThrow({ where: { id: this.singletonId } });
      });
      return { ok: false as const, message: `❌ ${message}`, error: message, config: reloaded };
    }
  }
}

export class PaymentService {
  static alreadyProcessedMessage = ALREADY_PROCESSED_FA;

  static async requestGatewayInvoice(gateway: { apiBaseUrl: string; apiKey: string }, price: number, callbackUrl: string) {
    const payload = { price, callback_url: callbackUrl };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    let response: Response;
    try {
      response = await fetch(`${normalizeBaseUrl(gateway.apiBaseUrl)}/invoice/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-KEY": gateway.apiKey },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (error) {
      throw new GatewayConnectionError(error instanceof Error && error.name === "AbortError" ? "درخواست درگاه timeout شد" : "سرور درگاه در دسترس نیست");
    } finally {
      clearTimeout(timeout);
    }
    const raw = await response.json().catch(() => ({}));
    if (!response.ok) throw new GatewayHttpError(response.status, `Gateway error ${response.status}: ${safeJson(raw)}`);
    return { parsed: parseGatewayResponse(raw), raw, payload };
  }

  static async quoteProductInvoice(tx: DbClient, data: { userId: string; productId: string; couponCode?: string }): Promise<ProductInvoiceQuote> {
    const product = await this.validateProductForPurchase(data.userId, data.productId, undefined, tx);
    const originalAmount = product.price;
    let discountAmount = 0;
    let finalAmount = originalAmount;
    let couponId: string | null = null;
    let couponCode: string | null = null;
    if (data.couponCode?.trim()) {
      const validation = await CouponService.validateForCheckout({ code: data.couponCode, userId: data.userId, originalAmount, tx });
      if (!validation.ok) {
        paymentLog("COUPON_RECHECK_FAILED", { userId: data.userId, productId: data.productId, couponCode: normalizeCouponCode(data.couponCode), reason: validation.reason, severity: "warning" });
        await audit(tx, { userId: data.userId, action: "COUPON_RECHECK_FAILED", metadata: { productId: data.productId, couponCode: normalizeCouponCode(data.couponCode), reason: validation.reason, severity: "warning" } });
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

  private static assertInvoiceAmountIntegrity(invoice: Pick<PaymentInvoice, "amount" | "originalAmount" | "discountAmount" | "gatewayAmount">) {
    const expectedAmount = invoice.originalAmount > 0 ? invoice.originalAmount - invoice.discountAmount : invoice.amount;
    if (expectedAmount !== invoice.amount) return { ok: false as const, reason: "stored_final_amount_mismatch", expectedAmount };
    if (invoice.gatewayAmount !== null && invoice.gatewayAmount !== undefined && invoice.gatewayAmount !== invoice.amount) return { ok: false as const, reason: "gateway_amount_mismatch", expectedAmount };
    return { ok: true as const, expectedAmount };
  }

  private static isUniqueConstraintError(error: unknown, field: string) {
    return error instanceof PrismaClientKnownRequestError && error.code === "P2002" && Array.isArray(error.meta?.target) && error.meta.target.includes(field);
  }

  private static async attachGatewayInvoiceResponse(invoice: PaymentInvoice, gatewayResult: { parsed: { payId: string; paymentLink: string }; raw: unknown }, gatewayAmount: number) {
    const duplicate = await prisma.paymentInvoice.findFirst({
      where: { payId: gatewayResult.parsed.payId, NOT: { id: invoice.id } },
      select: { id: true, userId: true, status: true },
    });
    if (duplicate) {
      paymentLog("PAYMENT_GATEWAY_DUPLICATE_PAY_ID", { invoiceId: invoice.id, userId: invoice.userId, payId: gatewayResult.parsed.payId, duplicateInvoiceId: duplicate.id });
      await audit(prisma, {
        userId: invoice.userId,
        invoiceId: invoice.id,
        action: "PAYMENT_GATEWAY_DUPLICATE_PAY_ID",
        metadata: { payId: gatewayResult.parsed.payId, duplicateInvoiceId: duplicate.id, duplicateUserId: duplicate.userId, duplicateStatus: duplicate.status },
      });
      throw new DuplicateGatewayPayIdError(gatewayResult.parsed.payId, duplicate.id);
    }

    try {
      paymentLog("PAYMENT_INVOICE_UPDATE_PAYID", { invoiceId: invoice.id, userId: invoice.userId, payId: gatewayResult.parsed.payId, gatewayAmount });
      await audit(prisma, { userId: invoice.userId, invoiceId: invoice.id, action: "PAYMENT_INVOICE_UPDATE_PAYID", metadata: { payId: gatewayResult.parsed.payId, gatewayAmount } });
      const attached = await prisma.paymentInvoice.updateMany({
        where: { id: invoice.id, status: "PENDING", OR: [{ payId: null }, { payId: { isSet: false } }] },
        data: {
          payId: gatewayResult.parsed.payId,
          paymentLink: gatewayResult.parsed.paymentLink,
          gatewayAmount,
          gatewayResponse: safeJson(gatewayResult.raw),
        },
      });
      if (attached.count === 1) return prisma.paymentInvoice.findUniqueOrThrow({ where: { id: invoice.id } });

      const current = await prisma.paymentInvoice.findUniqueOrThrow({ where: { id: invoice.id } });
      if (current.status === "PENDING" && current.payId === gatewayResult.parsed.payId && current.paymentLink === gatewayResult.parsed.paymentLink) {
        paymentLog("PAYMENT_LINK_READY", { invoiceId: current.id, userId: current.userId, payId: current.payId, idempotent: true });
        await audit(prisma, { userId: current.userId, invoiceId: current.id, action: "PAYMENT_LINK_READY", metadata: { payId: current.payId, idempotent: true } });
        return current;
      }
      throw new Error("فاکتور دیگر قابل اتصال به پاسخ درگاه نیست");
    } catch (error) {
      if (this.isUniqueConstraintError(error, "payId")) {
        const racedDuplicate = await prisma.paymentInvoice.findFirst({ where: { payId: gatewayResult.parsed.payId, NOT: { id: invoice.id } }, select: { id: true, userId: true, status: true } });
        paymentLog("PAYMENT_GATEWAY_DUPLICATE_PAY_ID", { invoiceId: invoice.id, userId: invoice.userId, payId: gatewayResult.parsed.payId, duplicateInvoiceId: racedDuplicate?.id, race: true });
        await audit(prisma, {
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

  static async createInvoice(data: { userId: string; amount: number; type: PaymentInvoiceType; productId?: string; originalAmount?: number; discountAmount?: number; couponId?: string | null; couponCode?: string | null; renewalId?: string; renewalXrayClientId?: string }) {
    assertPositiveAmount(data.amount);
    const gateway = await PaymentGatewayService.get();
    if (!gateway.enabled) throw new Error("پرداخت آنی در حال حاضر غیرفعال است");
    PaymentGatewayService.validateConfig(gateway);

    await this.assertUserCanPay(data.userId);
    if (data.type === "PRODUCT_PURCHASE") await this.validateProductForPurchase(data.userId, data.productId, undefined);

    const originalAmount = data.originalAmount ?? data.amount;
    const discountAmount = data.discountAmount ?? 0;
    if (originalAmount - discountAmount !== data.amount) throw new Error("مبلغ نهایی فاکتور با تخفیف همخوانی ندارد");

    const createPayload: Prisma.PaymentInvoiceCreateInput = {
      user: { connect: { id: data.userId } },
      amount: data.amount,
      originalAmount,
      discountAmount,
      coupon: data.couponId ? { connect: { id: data.couponId } } : undefined,
      couponCode: data.couponCode ?? undefined,
      callbackToken: crypto.randomBytes(32).toString("hex"),
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
      payId: Object.prototype.hasOwnProperty.call(createPayload, "payId") ? (createPayload as Record<string, unknown>).payId : "<omitted>",
      hasPayId: Object.prototype.hasOwnProperty.call(createPayload, "payId"),
    });

    const invoice = await prisma.paymentInvoice.create({ data: createPayload });
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
    await audit(prisma, { userId: data.userId, invoiceId: invoice.id, action: "PAYMENT_INVOICE_CREATED", metadata: { type: data.type, originalAmount, discountAmount, finalAmount: data.amount, couponId: data.couponId, couponCode: data.couponCode, status: "PENDING" } });
    if (data.couponId) await audit(prisma, { userId: data.userId, invoiceId: invoice.id, action: "COUPON_APPLIED", metadata: { couponId: data.couponId, couponCode: data.couponCode, originalAmount, discountAmount, finalAmount: data.amount, usageRecorded: false } });

    const callbackUrl = invoiceCallbackUrl(gateway.callbackUrl, { invoiceId: invoice.id, callbackToken: invoice.callbackToken });
    paymentLog("PAYMENT_GATEWAY_REQUEST", { invoiceId: invoice.id, userId: data.userId, endpoint: "/invoice/create", price: data.amount, callbackUrl });
    await audit(prisma, { userId: data.userId, invoiceId: invoice.id, action: "PAYMENT_GATEWAY_REQUEST", metadata: { endpoint: "/invoice/create", price: data.amount, callback_url: callbackUrl } });
    try {
      const gatewayResult = await this.requestGatewayInvoice(gateway, data.amount, callbackUrl);
      paymentLog("PAYMENT_INVOICE_GATEWAY_RESPONSE", { invoiceId: invoice.id, userId: data.userId, payId: gatewayResult.parsed.payId, paymentLink: gatewayResult.parsed.paymentLink });
      await audit(prisma, { userId: data.userId, invoiceId: invoice.id, action: "PAYMENT_INVOICE_GATEWAY_RESPONSE", metadata: gatewayResult.raw as Record<string, unknown> });
      const updatedInvoice = await this.attachGatewayInvoiceResponse(invoice, gatewayResult, data.amount);
      await prisma.paymentGatewayConfig.update({ where: { id: "singleton" }, data: { lastSuccessfulRequest: new Date(), lastConnectionStatus: "success", lastConnectionError: null } });
      paymentLog("PAYMENT_LINK_READY", { invoiceId: updatedInvoice.id, userId: updatedInvoice.userId, payId: updatedInvoice.payId, paymentLink: updatedInvoice.paymentLink });
      await audit(prisma, { userId: updatedInvoice.userId, invoiceId: updatedInvoice.id, action: "PAYMENT_LINK_READY", metadata: { payId: updatedInvoice.payId, paymentLink: updatedInvoice.paymentLink } });
      return updatedInvoice;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      paymentLog("PAYMENT_GATEWAY_REQUEST_FAILED", { invoiceId: invoice.id, userId: data.userId, stage: "gateway_create", error: message });
      await prisma.paymentInvoice.update({ where: { id: invoice.id }, data: { gatewayResponse: safeJson({ error: message }), deliveryStatus: "GATEWAY_REQUEST_FAILED" } });
      await prisma.paymentGatewayConfig.update({ where: { id: "singleton" }, data: { lastFailedRequest: new Date(), lastConnectionStatus: "failed", lastConnectionError: message } });
      await audit(prisma, { userId: data.userId, invoiceId: invoice.id, action: "PAYMENT_GATEWAY_REQUEST_FAILED", metadata: { stage: "gateway_create", error: message } });
      if (error instanceof DuplicateGatewayPayIdError) {
        MonitoringService.record({ type: "PAYMENT_FAILED", section: "Payment Gateway", description: `Duplicate gateway pay_id: ${error.payId}`, userId: data.userId, severity: "critical", suggestedAction: "درگاه پرداخت و یکتایی pay_id را بررسی کنید.", metadata: { invoiceId: invoice.id, duplicateInvoiceId: error.existingInvoiceId } });
        await prisma.paymentInvoice.update({ where: { id: invoice.id }, data: { gatewayResponse: safeJson({ error: error.message, payId: error.payId, duplicateInvoiceId: error.existingInvoiceId }), deliveryStatus: "DUPLICATE_GATEWAY_PAY_ID" } });
        throw new Error("پاسخ درگاه پرداخت معتبر نبود. موضوع ثبت شد و پشتیبانی در حال بررسی است.");
      }
      MonitoringService.record({ type: "PAYMENT_FAILED", section: "Payment Gateway", description: message, userId: data.userId, severity: "critical", suggestedAction: "وضعیت API درگاه، کلید API و شبکه سرور را بررسی کنید.", metadata: { invoiceId: invoice.id, stage: "gateway_create" } });
      throw new Error("ارتباط با درگاه پرداخت برقرار نشد. لطفاً چند دقیقه دیگر دوباره تلاش کنید");
    }
  }

  private static async findInvoiceByCallbackReference(reference: string | CallbackReference) {
    const normalized = normalizeCallbackReference(reference);
    if (normalized.token) {
      const byToken = await prisma.paymentInvoice.findUnique({ where: { callbackToken: normalized.token } });
      if (byToken) return { invoice: byToken, matchedBy: "callbackToken" };
    }

    if (normalized.invoice && isValidObjectId(normalized.invoice)) {
      const byInvoice = await prisma.paymentInvoice.findUnique({ where: { id: normalized.invoice } });
      if (byInvoice) return { invoice: byInvoice, matchedBy: "invoice" };
    }

    if (normalized.invoice_id) {
      const byLegacyToken = await prisma.paymentInvoice.findUnique({ where: { callbackToken: normalized.invoice_id } });
      // Gateway documentation calls this parameter invoice_id, but older bot links used token/invoice/pay_id.
      // Never pass invoice_id to the ObjectId lookup until it is syntactically validated.
      if (byLegacyToken) return { invoice: byLegacyToken, matchedBy: "legacyToken" };
      if (isValidObjectId(normalized.invoice_id)) {
        const byLegacyInvoice = await prisma.paymentInvoice.findUnique({ where: { id: normalized.invoice_id } });
        if (byLegacyInvoice) return { invoice: byLegacyInvoice, matchedBy: "legacyInvoice" };
      }
      const byPayId = await prisma.paymentInvoice.findFirst({ where: { payId: normalized.invoice_id } });
      if (byPayId) return { invoice: byPayId, matchedBy: "payId" };
    }

    if (normalized.pay_id) {
      const byPayId = await prisma.paymentInvoice.findFirst({ where: { payId: normalized.pay_id } });
      if (byPayId) return { invoice: byPayId, matchedBy: "payId" };
    }

    return null;
  }

  static async completePayment(reference: string | CallbackReference, metadata: Record<string, unknown> = {}) {
    const normalizedReference = normalizeCallbackReference(reference);
    if (!normalizedReference.token && !normalizedReference.invoice && !normalizedReference.invoice_id && !normalizedReference.pay_id) {
      paymentLog("PAYMENT_CALLBACK_REJECTED", { reason: "missing_callback_reference", query: metadata.query });
      await prisma.auditLog.create({ data: { actorId: "system", action: "PAYMENT_CALLBACK_REJECTED", metadata: JSON.stringify({ reason: "missing_callback_reference", ...metadata }) } });
      MonitoringService.record({ type: "PAYMENT_CALLBACK_FAILED", section: "Payment Callback", description: "Missing callback reference", severity: "critical", suggestedAction: "پارامترهای callback درگاه را بررسی کنید.", metadata });
      return { statusCode: 400, text: "Invalid payment callback." };
    }

    const resolved = await this.findInvoiceByCallbackReference(normalizedReference);
    if (!resolved) {
      paymentLog("PAYMENT_CALLBACK_REJECTED", { reason: "invoice_not_found", reference: normalizedReference, query: metadata.query });
      await prisma.auditLog.create({ data: { actorId: "system", action: "PAYMENT_CALLBACK_REJECTED", metadata: JSON.stringify({ reason: "invoice_not_found", reference: normalizedReference, ...metadata }) } });
      MonitoringService.record({ type: "PAYMENT_CALLBACK_FAILED", section: "Payment Callback", description: "Payment invoice not found", severity: "critical", suggestedAction: "ارسال invoice_id/token/pay_id از سمت درگاه را بررسی کنید.", metadata: { reference: normalizedReference, ...metadata } });
      return { statusCode: 404, text: "Payment invoice not found." };
    }
    const invoice = resolved.invoice;

    const callbackAt = new Date();
    await prisma.paymentInvoice.update({ where: { id: invoice.id }, data: { callbackCount: { increment: 1 }, lastCallbackAt: callbackAt } });
    paymentLog("PAYMENT_CALLBACK_RECEIVED", { invoiceId: invoice.id, userId: invoice.userId, status: invoice.status, matchedBy: resolved.matchedBy, callbackAt: callbackAt.toISOString(), query: metadata.query });
    await audit(prisma, { userId: invoice.userId, invoiceId: invoice.id, action: "PAYMENT_CALLBACK_RECEIVED", metadata: { reference: normalizedReference, matchedBy: resolved.matchedBy, ...metadata } });

    const integrity = this.assertInvoiceAmountIntegrity(invoice);
    if (!integrity.ok) {
      const failed = await prisma.paymentInvoice.updateMany({ where: { id: invoice.id, status: "PENDING" }, data: { status: "FAILED", verifiedAt: new Date(), deliveryStatus: "FAILED" } });
      paymentLog("PAYMENT_PROCESS_FAILED", { invoiceId: invoice.id, userId: invoice.userId, stage: "callback_security", reason: integrity.reason, statusChanged: failed.count === 1 });
      await audit(prisma, { userId: invoice.userId, invoiceId: invoice.id, action: "PAYMENT_PROCESS_FAILED", metadata: { stage: "callback_security", reason: integrity.reason, gatewayAmount: invoice.gatewayAmount, amount: invoice.amount, originalAmount: invoice.originalAmount, discountAmount: invoice.discountAmount, amountExpected: integrity.expectedAmount } });
      MonitoringService.record({ type: "PAYMENT_CALLBACK_FAILED", section: "Payment Callback", description: `Invoice amount mismatch: ${integrity.reason}`, userId: invoice.userId, severity: "critical", suggestedAction: "مبلغ فاکتور و مقدار برگشتی درگاه را بررسی کنید.", metadata: { invoiceId: invoice.id } });
      return { statusCode: 409, text: "Invoice amount mismatch.", failed: { invoice: { ...invoice, status: failed.count === 1 ? "FAILED" : invoice.status }, type: invoice.type as PaymentInvoiceType } };
    }

    if (normalizedReference.pay_id && invoice.payId && normalizedReference.pay_id !== invoice.payId) {
      paymentLog("PAYMENT_CALLBACK_REJECTED", { invoiceId: invoice.id, userId: invoice.userId, reason: "pay_id_mismatch", expectedPayId: invoice.payId, receivedPayId: normalizedReference.pay_id });
      await audit(prisma, { userId: invoice.userId, invoiceId: invoice.id, action: "PAYMENT_CALLBACK_REJECTED", metadata: { reason: "pay_id_mismatch", expectedPayId: invoice.payId, receivedPayId: normalizedReference.pay_id, reference: normalizedReference } });
      MonitoringService.record({ type: "PAYMENT_CALLBACK_FAILED", section: "Payment Callback", description: "pay_id mismatch", userId: invoice.userId, severity: "critical", suggestedAction: "احتمال callback اشتباه یا دستکاری شده را بررسی کنید.", metadata: { invoiceId: invoice.id, expectedPayId: invoice.payId, receivedPayId: normalizedReference.pay_id } });
      return { statusCode: 409, text: "Payment callback pay_id mismatch." };
    }

    if (normalizedReference.pay_id && !invoice.payId) {
      const duplicate = await prisma.paymentInvoice.findFirst({ where: { payId: normalizedReference.pay_id, NOT: { id: invoice.id } }, select: { id: true, userId: true, status: true } });
      if (duplicate) {
        paymentLog("PAYMENT_CALLBACK_REJECTED", { invoiceId: invoice.id, userId: invoice.userId, reason: "duplicate_callback_pay_id", payId: normalizedReference.pay_id, duplicateInvoiceId: duplicate.id });
        await audit(prisma, { userId: invoice.userId, invoiceId: invoice.id, action: "PAYMENT_GATEWAY_DUPLICATE_PAY_ID", metadata: { source: "callback", payId: normalizedReference.pay_id, duplicateInvoiceId: duplicate.id, duplicateUserId: duplicate.userId, duplicateStatus: duplicate.status } });
        MonitoringService.record({ type: "PAYMENT_DUPLICATE_CALLBACK", section: "Payment Callback", description: `Duplicate callback pay_id: ${normalizedReference.pay_id}`, userId: invoice.userId, severity: "critical", suggestedAction: "pay_id تکراری در درگاه را فوری بررسی کنید.", metadata: { invoiceId: invoice.id, duplicateInvoiceId: duplicate.id } });
        return { statusCode: 409, text: "Duplicate gateway pay_id." };
      }
    }

    paymentLog("PAYMENT_CALLBACK_PROCESSING", { invoiceId: invoice.id, userId: invoice.userId, status: invoice.status, type: invoice.type });
    await audit(prisma, { userId: invoice.userId, invoiceId: invoice.id, action: "PAYMENT_CALLBACK_PROCESSING", metadata: { status: invoice.status, type: invoice.type, payId: invoice.payId } });
    paymentLog("PAYMENT_CALLBACK_VALIDATED", { invoiceId: invoice.id, userId: invoice.userId, status: invoice.status, type: invoice.type });
    await audit(prisma, { userId: invoice.userId, invoiceId: invoice.id, action: "PAYMENT_CALLBACK_VALIDATED", metadata: { status: invoice.status, type: invoice.type } });

    if (invoice.status === "COMPLETED" || invoice.status === "PAID") {
      paymentLog("PAYMENT_DUPLICATE_CALLBACK_IGNORED", { invoiceId: invoice.id, userId: invoice.userId, status: invoice.status });
      await audit(prisma, { userId: invoice.userId, invoiceId: invoice.id, action: "PAYMENT_DUPLICATE_CALLBACK_IGNORED", metadata: { status: invoice.status, reference: normalizedReference } });
      MonitoringService.record({ type: "PAYMENT_DUPLICATE_CALLBACK", section: "Payment Callback", description: `Duplicate callback ignored for ${invoice.status}`, userId: invoice.userId, severity: "warning", suggestedAction: "اگر تکرار زیاد است، retry درگاه را بررسی کنید.", metadata: { invoiceId: invoice.id, status: invoice.status } });
      if (invoice.status === "COMPLETED") return { statusCode: 200, text: ALREADY_PROCESSED_FA };
    }
    if (invoice.status === "FAILED" || invoice.status === "CANCELED" || invoice.status === "EXPIRED") return { statusCode: 409, text: "Payment invoice is not payable." };

    let paidInvoice = invoice;
    if (invoice.status === "PENDING") {
      const markedPaid = await prisma.$transaction(async (tx) => {
        const locked = await tx.paymentInvoice.updateMany({
          where: { id: invoice.id, status: "PENDING" },
          data: { status: "PAID", paidAt: new Date(), verifiedAt: new Date(), deliveryStatus: "PENDING" },
        });
        if (locked.count !== 1) return null;
        const fresh = await tx.paymentInvoice.findUniqueOrThrow({ where: { id: invoice.id } });
        await audit(tx, { userId: fresh.userId, invoiceId: fresh.id, action: "PAYMENT_INVOICE_MARKED_PAID", metadata: { payId: fresh.payId, amount: fresh.amount, type: fresh.type } });
        return fresh;
      });
      if (!markedPaid) return { statusCode: 200, text: ALREADY_PROCESSED_FA };
      paidInvoice = markedPaid;
      paymentLog("PAYMENT_INVOICE_MARKED_PAID", { invoiceId: paidInvoice.id, userId: paidInvoice.userId, payId: paidInvoice.payId, amount: paidInvoice.amount, type: paidInvoice.type });
      paymentLog("PAYMENT_MARKED_PAID", { invoiceId: paidInvoice.id, userId: paidInvoice.userId, payId: paidInvoice.payId, amount: paidInvoice.amount, type: paidInvoice.type });
    }

    const staleProcessingBefore = new Date(Date.now() - 5 * 60_000);
    const fulfillmentLock = await prisma.paymentInvoice.updateMany({
      where: { id: paidInvoice.id, status: "PAID", OR: [{ deliveryStatus: null }, { deliveryStatus: { in: ["PENDING", "FAILED"] } }, { deliveryStatus: "PROCESSING", updatedAt: { lt: staleProcessingBefore } }] },
      data: { deliveryStatus: "PROCESSING" },
    });
    if (fulfillmentLock.count !== 1) return { statusCode: 200, text: ALREADY_PROCESSED_FA };

    try {
      paymentLog("PAYMENT_FULFILLMENT_STARTED", { invoiceId: paidInvoice.id, userId: paidInvoice.userId, type: paidInvoice.type });
      await audit(prisma, { userId: paidInvoice.userId, invoiceId: paidInvoice.id, action: "PAYMENT_FULFILLMENT_STARTED", metadata: { type: paidInvoice.type } });
      let result = await this.fulfillPaidInvoice(paidInvoice.id);
      if ((result as any).needsXrayProvisioning && (result as any).order?.id) result = await this.provisionXrayClient((result as any).order.id, paidInvoice.id) as any;
      paymentLog("PAYMENT_COMPLETED", { invoiceId: paidInvoice.id, userId: paidInvoice.userId, type: paidInvoice.type });
      AdminService.invalidateDashboardCache();
      return { statusCode: 200, text: "Payment completed successfully.", result };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      paymentLog("PAYMENT_PROCESS_FAILED", { invoiceId: paidInvoice.id, userId: paidInvoice.userId, stage: "fulfillment", error: message });
      paymentLog("PAYMENT_FAILED", { invoiceId: paidInvoice.id, userId: paidInvoice.userId, stage: "fulfillment", error: message });
      await prisma.paymentInvoice.update({ where: { id: paidInvoice.id }, data: { deliveryStatus: "FAILED_DELIVERY", verifiedAt: new Date() } });
      MonitoringService.record({ type: "PAYMENT_DELIVERY_FAILED", section: "Payment Delivery", description: message, userId: paidInvoice.userId, severity: "critical", suggestedAction: "تحویل محصول/شارژ کیف پول را از پنل مدیریت بررسی و دستی اصلاح کنید.", metadata: { invoiceId: paidInvoice.id, type: paidInvoice.type } });
      eventBus.emit("payment.delivery.failed", { invoiceId: paidInvoice.id, userId: paidInvoice.userId, type: paidInvoice.type, error: message });
      await audit(prisma, { userId: paidInvoice.userId, invoiceId: paidInvoice.id, action: "PAYMENT_PROCESS_FAILED", metadata: { stage: "fulfillment", error: message, statusKept: "PAID" } });
      return { statusCode: 500, text: "Payment processing failed.", failed: { invoice: paidInvoice, type: paidInvoice.type as PaymentInvoiceType, error: message } };
    }
  }

  private static async fulfillPaidInvoice(invoiceId: string) {
    return prisma.$transaction(async (tx) => {
      const fresh = await tx.paymentInvoice.findUniqueOrThrow({ where: { id: invoiceId } });
      if (fresh.status === "COMPLETED") return { invoice: fresh, type: fresh.type as PaymentInvoiceType };
      if (fresh.status !== "PAID") throw new Error("فاکتور در وضعیت پرداخت‌شده نیست");
      if (fresh.deliveryStatus !== "PROCESSING") throw new Error("فاکتور در حال پردازش تحویل نیست");

      if (fresh.type === "XRAY_RENEWAL") {
        const result = await this.fulfillXrayRenewal(fresh.id);
        return { ...result, type: fresh.type as PaymentInvoiceType };
      }

      if (fresh.type === "WALLET_TOPUP") {
        const user = await this.creditWallet(tx, { userId: fresh.userId, amount: fresh.amount, reason: `شارژ کیف پول با پرداخت آنی - فاکتور ${fresh.id}`, actorId: fresh.userId, invoiceId: fresh.id, referenceId: `invoice:${fresh.id}` });
        const completed = await tx.paymentInvoice.update({ where: { id: fresh.id }, data: { status: "COMPLETED", completedAt: new Date(), verifiedAt: new Date(), deliveryStatus: "COMPLETED" } });
        paymentLog("PAYMENT_WALLET_CREDITED", { invoiceId: fresh.id, userId: fresh.userId, amount: fresh.amount, balance: user.balance });
        await audit(tx, { userId: fresh.userId, invoiceId: fresh.id, action: "PAYMENT_WALLET_CREDITED", metadata: { amount: fresh.amount, balance: user.balance } });
        await audit(tx, { userId: fresh.userId, invoiceId: fresh.id, action: "PAYMENT_INVOICE_COMPLETED", metadata: { amount: fresh.amount, type: fresh.type } });
        return { invoice: completed, user, type: fresh.type as PaymentInvoiceType };
      }

      if (fresh.orderId) {
        const existingOrder = await tx.order.findUnique({ where: { id: fresh.orderId }, include: { product: true, items: { include: { productAccount: true, xrayClient: true }, take: 1 } } });
        if (existingOrder?.items[0]) {
          const existingClient = existingOrder.items[0].xrayClient;
          if (existingClient && existingClient.status !== "active") {
            if (existingClient.status === "failed") throw new Error("تحویل Xray قبلاً ناموفق شده و نیازمند بررسی مدیر است");
            return { invoice: fresh, order: existingOrder, product: existingOrder.product, account: { id: existingClient.id, username: existingClient.clientEmail, subscriptionLink: null, configLink: null, config: "XRAY_LIVE_LINKS" }, orderItem: existingOrder.items[0], xrayClient: existingClient, needsXrayProvisioning: existingClient.status === "provisioning" || existingClient.status === "creating", type: fresh.type as PaymentInvoiceType };
          }
          const completed = await tx.paymentInvoice.update({ where: { id: fresh.id }, data: { status: "COMPLETED", completedAt: fresh.completedAt ?? new Date(), verifiedAt: new Date(), deliveryStatus: "COMPLETED" } });
          return { invoice: completed, order: existingOrder, product: existingOrder.product, account: existingOrder.items[0].productAccount, orderItem: existingOrder.items[0], type: fresh.type as PaymentInvoiceType };
        }
      }

      const delivered = await this.purchaseProduct(tx, { userId: fresh.userId, productId: fresh.productId ?? "", couponCode: fresh.couponCode ?? undefined, method: "INSTANT", invoice: fresh });
      if (delivered.xrayClient) {
        const processing = await tx.paymentInvoice.update({ where: { id: fresh.id }, data: { verifiedAt: new Date(), orderId: delivered.order.id, deliveryStatus: "PROCESSING" } });
        return { invoice: processing, ...delivered, needsXrayProvisioning: true, type: fresh.type as PaymentInvoiceType };
      }
      const completed = await tx.paymentInvoice.update({ where: { id: fresh.id }, data: { status: "COMPLETED", completedAt: new Date(), verifiedAt: new Date(), orderId: delivered.order.id, deliveryStatus: "COMPLETED" } });
      paymentLog("PAYMENT_PRODUCT_DELIVERED", { invoiceId: fresh.id, userId: fresh.userId, orderId: delivered.order.id, productId: delivered.product.id, accountId: delivered.account.id });
      await audit(tx, { userId: fresh.userId, invoiceId: fresh.id, action: "PAYMENT_PRODUCT_DELIVERED", metadata: { orderId: delivered.order.id, productId: delivered.product.id, accountId: delivered.account.id } });
      await audit(tx, { userId: fresh.userId, invoiceId: fresh.id, action: "PAYMENT_INVOICE_COMPLETED", metadata: { orderId: delivered.order.id, amount: fresh.amount, type: fresh.type } });
      return { invoice: completed, ...delivered, needsXrayProvisioning: Boolean(delivered.xrayClient), type: fresh.type as PaymentInvoiceType };
    });
  }


  static async buildXrayRenewalQuote(userId: string, xrayClientId: string, productId: string) {
    const [client, product] = await Promise.all([
      prisma.xrayClient.findFirstOrThrow({ where: { id: xrayClientId, userId }, include: { product: true } }),
      prisma.product.findFirstOrThrow({ where: { id: productId, mode: "xray_auto", isActive: true, deletedAt: null } }),
    ]);
    if (!product.trafficBytes || !product.durationDays) throw new Error("پلن تمدید Xray کامل نیست");
    let traffic: any = null;
    let liveOk = true;
    try { traffic = await XrayClientService.traffic(client.clientEmail); } catch { liveOk = false; }
    const snapshot = xrayTrafficSnapshot(traffic, client.trafficBytes, client.usedBytes);
    const now = new Date();
    const baseExpiry = client.expiresAt > now ? client.expiresAt : now;
    const newExpiry = new Date(baseExpiry.getTime() + product.durationDays * 86_400_000);
    const newTotalBytes = snapshot.totalBytes + product.trafficBytes;
    return { client, currentProduct: client.product, product, ...snapshot, newTotalBytes, oldExpiry: client.expiresAt, newExpiry, addTrafficBytes: product.trafficBytes, addDays: product.durationDays, liveOk };
  }

  static async renewXrayWithWallet(userId: string, xrayClientId: string, productId: string) {
    const quote = await this.buildXrayRenewalQuote(userId, xrayClientId, productId);
    const renewal = await prisma.$transaction(async (tx) => {
      await this.assertUserCanPay(userId, tx);
      const walletUser = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { balance: true } });
      if (walletUser.balance < quote.product.price) throw new Error("موجودی کیف پول کافی نیست");
      const created = await tx.xrayRenewal.create({ data: { userId, xrayClientId, renewalProductId: productId, oldTotalBytes: quote.totalBytes, newTotalBytes: quote.newTotalBytes, oldExpiry: quote.oldExpiry, newExpiry: quote.newExpiry, oldUsedBytes: quote.usedBytes, oldRemainingBytes: quote.remainingBytes, addTrafficBytes: quote.addTrafficBytes, addDays: quote.addDays, status: "provisioning" } });
      await this.debitWallet(tx, { userId, amount: quote.product.price, reason: `تمدید سرویس Xray ${quote.client.clientEmail}`, actorId: userId, referenceId: `xray-renewal:${created.id}` });
      return created;
    });
    return this.applyXrayRenewal(renewal.id);
  }

  static async createXrayRenewalInvoice(userId: string, xrayClientId: string, productId: string) {
    const quote = await this.buildXrayRenewalQuote(userId, xrayClientId, productId);
    const renewal = await prisma.xrayRenewal.create({ data: { userId, xrayClientId, renewalProductId: productId, oldTotalBytes: quote.totalBytes, newTotalBytes: quote.newTotalBytes, oldExpiry: quote.oldExpiry, newExpiry: quote.newExpiry, oldUsedBytes: quote.usedBytes, oldRemainingBytes: quote.remainingBytes, addTrafficBytes: quote.addTrafficBytes, addDays: quote.addDays, status: "provisioning" } });
    const invoice = await this.createInvoice({ userId, amount: quote.product.price, originalAmount: quote.product.price, discountAmount: 0, type: "XRAY_RENEWAL", productId, renewalId: renewal.id, renewalXrayClientId: xrayClientId });
    await prisma.xrayRenewal.update({ where: { id: renewal.id }, data: { invoiceId: invoice.id } });
    return invoice;
  }

  private static async fulfillXrayRenewal(invoiceId: string) {
    const invoice = await prisma.paymentInvoice.findUniqueOrThrow({ where: { id: invoiceId } });
    const renewal = invoice.renewalId ? await prisma.xrayRenewal.findUniqueOrThrow({ where: { id: invoice.renewalId }, include: { xrayClient: true, renewalProduct: true } }) : await prisma.xrayRenewal.findFirstOrThrow({ where: { invoiceId }, include: { xrayClient: true, renewalProduct: true } });
    const updated = await this.applyXrayRenewal(renewal.id, invoiceId);
    const completed = await prisma.paymentInvoice.update({ where: { id: invoiceId }, data: { status: "COMPLETED", completedAt: new Date(), verifiedAt: new Date(), deliveryStatus: "COMPLETED" } });
    return { invoice: completed, renewal: updated, xrayClient: updated.xrayClient };
  }

  private static async applyXrayRenewal(renewalId: string, invoiceId?: string) {
    const renewal = await prisma.xrayRenewal.findUniqueOrThrow({ where: { id: renewalId }, include: { xrayClient: true, renewalProduct: true } });
    if (renewal.status === "active") return renewal;
    try {
      await XrayClientService.updateClient(renewal.xrayClient.clientEmail, { totalBytes: renewal.newTotalBytes, expiresAt: renewal.newExpiry, telegramId: renewal.xrayClient.telegramId, limitIp: renewal.xrayClient.limitIp ?? renewal.renewalProduct.xrayLimitIp ?? 0, groupName: renewal.xrayClient.groupName ?? renewal.renewalProduct.xrayGroupName });
      const [, updatedRenewal] = await prisma.$transaction([
        prisma.xrayClient.update({ where: { id: renewal.xrayClientId }, data: { trafficBytes: renewal.newTotalBytes, expiresAt: renewal.newExpiry, limitIp: renewal.xrayClient.limitIp ?? renewal.renewalProduct.xrayLimitIp ?? 0, groupName: renewal.xrayClient.groupName ?? renewal.renewalProduct.xrayGroupName, status: "active", lastError: null } }),
        prisma.xrayRenewal.update({ where: { id: renewal.id }, data: { status: "active", lastError: null, invoiceId: invoiceId ?? renewal.invoiceId } }),
      ]);
      return prisma.xrayRenewal.findUniqueOrThrow({ where: { id: updatedRenewal.id }, include: { xrayClient: true, renewalProduct: true } });
    } catch (error) {
      const message = sanitizePanelError(error);
      await prisma.xrayRenewal.update({ where: { id: renewal.id }, data: { status: "renewal_failed", lastError: message, invoiceId: invoiceId ?? renewal.invoiceId } });
      await prisma.xrayClient.update({ where: { id: renewal.xrayClientId }, data: { status: "renewal_failed", lastError: message } });
      MonitoringService.record({ type: "PAYMENT_DELIVERY_FAILED", section: "Xray Renewal", description: message, userId: renewal.userId, severity: "critical", suggestedAction: "تمدید پرداخت‌شده را از پنل بررسی و دستی اعمال کنید.", metadata: { renewalId: renewal.id, invoiceId } });
      throw new Error("پرداخت موفق بود اما تمدید سرویس نیازمند بررسی است.");
    }
  }

  static async markNotification(invoiceId: string, status: "SENT" | "FAILED", metadata: Record<string, unknown> = {}) {
    const invoice = await prisma.paymentInvoice.update({ where: { id: invoiceId }, data: { notificationStatus: status } });
    paymentLog(status === "SENT" ? "PAYMENT_NOTIFICATION_SENT" : "PAYMENT_NOTIFICATION_FAILED", { invoiceId, userId: invoice.userId, ...metadata });
    await audit(prisma, { userId: invoice.userId, invoiceId, action: status === "SENT" ? "PAYMENT_NOTIFICATION_SENT" : "PAYMENT_NOTIFICATION_FAILED", metadata });
    return invoice;
  }

  static async creditWallet(tx: TxClient, data: { userId: string; amount: number; reason: string; actorId: string; invoiceId?: string; referenceId?: string }) {
    const user = await WalletService.credit(data.userId, data.amount, data.reason, tx, { actorId: data.actorId, referenceId: data.referenceId });
    await audit(tx, { userId: data.userId, invoiceId: data.invoiceId, action: "WALLET_CREDITED", actorId: data.actorId, metadata: { amount: data.amount, balance: user.balance, reason: data.reason, referenceId: data.referenceId } });
    return user;
  }

  static async debitWallet(tx: TxClient, data: { userId: string; amount: number; reason: string; actorId: string; invoiceId?: string; referenceId?: string }) {
    const user = await WalletService.debit(data.userId, data.amount, data.reason, tx, { actorId: data.actorId, referenceId: data.referenceId });
    await audit(tx, { userId: data.userId, invoiceId: data.invoiceId, action: "Wallet Debited", actorId: data.actorId, metadata: { amount: data.amount, balance: user.balance, reason: data.reason, referenceId: data.referenceId } });
    return user;
  }

  static async purchaseProduct(
    tx: TxClient,
    data: { userId: string; productId: string; couponCode?: string; method: PurchaseMethod; invoice?: Pick<PaymentInvoice, "id" | "amount" | "originalAmount" | "discountAmount" | "couponId" | "couponCode" | "productId" | "userId" | "status"> },
  ) {
    if (!data.productId) throw new Error("محصول فاکتور مشخص نیست");
    await this.assertUserCanPay(data.userId, tx);
    const product = await this.validateProductForPurchase(data.userId, data.productId, undefined, tx);

    let discountAmount = 0;
    let couponId: string | null = null;
    let couponMaxUses = 0;
    const originalAmount = product.price;
    let totalAmount = originalAmount;

    if (data.invoice) {
      if (data.invoice.userId !== data.userId || data.invoice.productId !== data.productId) throw new Error("فاکتور با خرید همخوانی ندارد");
      if (data.invoice.originalAmount !== originalAmount) throw new Error("مبلغ اصلی فاکتور با محصول همخوانی ندارد");
      if (data.invoice.status !== "PAID") throw new Error("پرداخت تایید نشده است");
      couponId = data.invoice.couponId ?? null;
      discountAmount = data.invoice.discountAmount;
      totalAmount = data.invoice.amount;
      if (originalAmount - discountAmount !== totalAmount) throw new Error("مبلغ فاکتور با مبلغ خرید همخوانی ندارد");
    } else if (data.couponCode) {
      const validation = await CouponService.validateForCheckout({ code: data.couponCode, userId: data.userId, originalAmount, tx });
      if (!validation.ok) {
        paymentLog("COUPON_RECHECK_FAILED", { userId: data.userId, productId: data.productId, couponCode: normalizeCouponCode(data.couponCode), reason: validation.reason, severity: "warning" });
        await audit(tx, { userId: data.userId, invoiceId: undefined, action: "COUPON_RECHECK_FAILED", metadata: { productId: data.productId, couponCode: normalizeCouponCode(data.couponCode), reason: validation.reason, severity: "warning" } });
        throw new Error(validation.reason);
      }
      couponId = validation.coupon.id;
      couponMaxUses = validation.coupon.maxUses;
      discountAmount = validation.discountAmount;
      totalAmount = validation.finalAmount;
    }

    const isXray = product.mode === "xray_auto" && Boolean(product.trafficBytes && product.durationDays && product.stockLimit && product.inboundIds.length);
    let account: Awaited<ReturnType<typeof tx.productAccount.findFirst>> | null = null;
    const reservedAt = new Date();
    if (isXray) {
      if (!product.trafficBytes || !product.durationDays || !product.stockLimit || !product.inboundIds.length) throw new Error("تنظیمات محصول Xray کامل نیست");
      await audit(tx, { userId: data.userId, invoiceId: data.invoice?.id, action: "XRAY_DELIVERY_PENDING", metadata: { productId: product.id, method: data.method } });
    } else {
      const candidates = await tx.productAccount.findMany({ where: { AND: [availableInventoryWhere(product.id), unassignedInventoryWhere()] }, orderBy: { createdAt: "asc" }, take: 10 });
      for (const candidate of candidates) {
        const reserved = await tx.productAccount.updateMany({ where: { id: candidate.id, productId: product.id, status: "available", soldTo: null, soldAt: null, assignedTo: null, assignedAt: null }, data: { status: "reserved", reservedBy: data.userId, reservedAt, reservationExpiresAt: new Date(reservedAt.getTime() + 15 * 60_000) } });
        if (reserved.count === 1) { account = candidate; break; }
      }
      if (!account) throw new Error("موجودی این محصول تمام شده است");
      await tx.productAccountHistory.create({ data: { accountId: account.id, actorId: data.userId, action: "Inventory Reserved", fromValue: "available", toValue: "reserved", metadata: JSON.stringify({ invoiceId: data.invoice?.id, productId: product.id, reservedAt, method: data.method }) } });
      await audit(tx, { userId: data.userId, invoiceId: data.invoice?.id, action: "Inventory Reserved", metadata: { accountId: account.id, productId: product.id, method: data.method } });
    }

    if (!isXray && data.method === "WALLET" && totalAmount > 0) {
      await this.debitWallet(tx, { userId: data.userId, amount: totalAmount, reason: `خرید محصول ${product.title}`, actorId: data.userId, referenceId: `purchase:${data.userId}:${product.id}:${reservedAt.getTime()}` });
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

    const order = await tx.order.create({ data: { userId: data.userId, productId: product.id, couponId, originalAmount, totalAmount, finalPaidAmount: totalAmount, discountAmount, status: isXray ? "pending" : "completed" } });
    const purchaseDate = new Date();
    const durationDays = isXray ? (product.durationDays ?? product.duration) : (account!.durationDays ?? product.duration);
    const expiresAt = new Date(purchaseDate.getTime() + durationDays * 86_400_000);
    let xrayClient: Awaited<ReturnType<typeof tx.xrayClient.create>> | null = null;
    let orderItem;
    if (isXray) {
      const user = await tx.user.findUniqueOrThrow({ where: { id: data.userId }, select: { telegramId: true } });
      const email = xrayClientEmail({ telegramId: user.telegramId, productId: product.id, orderId: order.id });
      xrayClient = await tx.xrayClient.upsert({
        where: { clientEmail: email },
        update: {},
        create: { userId: data.userId, telegramId: user.telegramId, productId: product.id, orderId: order.id, clientEmail: email, inboundIds: product.inboundIds, limitIp: product.xrayLimitIp ?? 0, groupName: product.xrayGroupName, expiresAt, trafficBytes: product.trafficBytes!, status: "provisioning" },
      });
      orderItem = null;
    } else {
      orderItem = await tx.orderItem.create({ data: { orderId: order.id, productId: product.id, productAccountId: account!.id, deliveredUsername: account!.username, deliveredPassword: account!.password, deliveredSubscriptionLink: account!.subscriptionLink, deliveredConfigLink: account!.configLink, deliveredConfig: account!.configLink || account!.config, purchaseDate, expiresAt, isActive: true } });
    }

    if (couponId && !isXray) {
      const usageSlot = await tx.couponUsage.count({ where: { couponId, userId: data.userId } });
      await tx.couponUsage.create({ data: { couponId, userId: data.userId, orderId: order.id, usageSlot } });
      await audit(tx, { userId: data.userId, invoiceId: data.invoice?.id, action: "COUPON_USAGE_RECORDED", metadata: { couponId, orderId: order.id, usageSlot, originalAmount, discountAmount, finalAmount: totalAmount } });
    }

    if (!isXray) {
      const soldAt = new Date();
      const sold = await tx.productAccount.updateMany({ where: { id: account!.id, productId: product.id, status: "reserved", reservedBy: data.userId, AND: [unassignedInventoryWhere()] }, data: { status: "sold", soldTo: data.userId, soldAt, assignedTo: data.userId, assignedAt: soldAt, expiresAt, reservedBy: null, reservedAt: null } });
      if (sold.count !== 1) throw new Error("تحویل اکانت ناموفق بود");
      if (!orderItem) throw new Error("آیتم سفارش تحویلی نامعتبر است");
      if (!orderItem.productAccountId) throw new Error("شناسه اکانت تحویلی نامعتبر است");
      await tx.productAccountHistory.create({ data: { accountId: account!.id, actorId: data.userId, action: "Inventory Sold", fromValue: "reserved", toValue: "sold", metadata: JSON.stringify({ invoiceId: data.invoice?.id, orderId: order.id, orderItemId: orderItem.id, productId: product.id, soldAt, expiresAt, method: data.method }) } });
      await audit(tx, { userId: data.userId, invoiceId: data.invoice?.id, action: "Inventory Sold", metadata: { accountId: account!.id, orderId: order.id } });
    }
    await audit(tx, { userId: data.userId, invoiceId: data.invoice?.id, action: isXray ? "XRAY_PRODUCT_DELIVERED" : "PRODUCT_DELIVERED", metadata: { productId: product.id, orderId: order.id, accountId: account?.id, xrayClientId: xrayClient?.id, method: data.method, originalAmount, discountAmount, finalAmount: totalAmount } });
    const deliveredAccount = account ? await tx.productAccount.findUniqueOrThrow({ where: { id: account.id } }) : { id: xrayClient!.id, username: xrayClient!.clientEmail, subscriptionLink: null, configLink: null, config: "XRAY_LIVE_LINKS" };
    return { order, product, account: deliveredAccount, orderItem, xrayClient, totalAmount, originalAmount, discountAmount, couponId, couponCode: data.couponCode, expiresAt };
  }

  private static async provisionXrayClient(orderId: string, invoiceId?: string) {
    const client = await prisma.xrayClient.findFirstOrThrow({ where: { orderId }, include: { order: true, product: true } });
    if (client.status === "active") {
      const orderItem = await prisma.orderItem.findFirst({ where: { xrayClientId: client.id } });
      const product = client.product ?? await prisma.product.findUniqueOrThrow({ where: { id: client.productId ?? "" } });
      return { order: client.order!, product, account: { id: client.id, username: client.clientEmail, subscriptionLink: null, configLink: null, config: "XRAY_LIVE_LINKS" }, orderItem, xrayClient: client, totalAmount: client.order?.totalAmount ?? 0, originalAmount: client.order?.originalAmount ?? 0, discountAmount: client.order?.discountAmount ?? 0, couponId: client.order?.couponId ?? null, couponCode: undefined, expiresAt: client.expiresAt };
    }
    if (client.status !== "provisioning" && client.status !== "creating") throw new Error("تحویل Xray قبلاً ناموفق شده و نیازمند بررسی مدیر است");
    const product = client.product ?? await prisma.product.findUniqueOrThrow({ where: { id: client.productId ?? "" } });
    try {
      await prisma.order.update({ where: { id: orderId }, data: { status: "panel_creating" } });
      const created = await XrayClientService.createClient({ email: client.clientEmail, trafficBytes: client.trafficBytes, expiresAt: client.expiresAt, telegramId: client.telegramId, inboundIds: client.inboundIds, limitIp: client.limitIp, groupName: client.groupName });
      const verified = await XrayClientService.verifyPanelClient({ email: client.clientEmail, expectedInboundIds: client.inboundIds });
      await prisma.order.update({ where: { id: orderId }, data: { status: "panel_verified" } });
      const result = await prisma.$transaction(async (tx) => {
        const freshOrder = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
        const sold = await tx.product.updateMany({ where: { id: product.id, mode: "xray_auto", soldCount: { lt: product.stockLimit ?? 0 } }, data: { soldCount: { increment: 1 } } });
        if (sold.count !== 1) throw new Error("موجودی این محصول تمام شده است");
        if (!invoiceId && freshOrder.totalAmount > 0) await this.debitWallet(tx, { userId: client.userId, amount: freshOrder.totalAmount, reason: `خرید محصول ${product.title}`, actorId: client.userId, referenceId: `purchase:${orderId}` });
        let item = await tx.orderItem.findFirst({ where: { xrayClientId: client.id } });
        if (!item) item = await tx.orderItem.create({ data: { orderId, productId: product.id, xrayClientId: client.id, deliveredUsername: client.clientEmail, deliveredSubscriptionLink: null, deliveredConfigLink: null, deliveredConfig: "XRAY_LIVE_LINKS", purchaseDate: new Date(), expiresAt: client.expiresAt, isActive: true } });
        if (freshOrder.couponId) {
          const used = await tx.couponUsage.count({ where: { couponId: freshOrder.couponId, userId: client.userId } });
          if (used === 0) await tx.couponUsage.create({ data: { couponId: freshOrder.couponId, userId: client.userId, orderId, usageSlot: 0 } });
        }
        const updatedClient = await tx.xrayClient.update({ where: { id: client.id }, data: { status: "active", clientSubId: verified.subId ?? created.subId, panelClientId: verified.panelClientId ?? created.uuid ?? created.id, lastError: null } });
        const completedOrder = await tx.order.update({ where: { id: orderId }, data: { status: "delivered" } });
        if (invoiceId) await tx.paymentInvoice.update({ where: { id: invoiceId }, data: { deliveryStatus: "COMPLETED", status: "COMPLETED", completedAt: new Date(), verifiedAt: new Date(), orderId } });
        await audit(tx, { userId: client.userId, invoiceId, action: "XRAY_PRODUCT_DELIVERED", metadata: { orderId, xrayClientId: client.id, deliveryId: orderId, panelClientId: verified.panelClientId, step: "delivered", status: "success" } });
        return { order: completedOrder, orderItem: item, xrayClient: updatedClient };
      });
      return { order: result.order, product, account: { id: result.xrayClient.id, username: result.xrayClient.clientEmail, subscriptionLink: null, configLink: null, config: "XRAY_LIVE_LINKS" }, orderItem: result.orderItem, xrayClient: result.xrayClient, totalAmount: result.order.totalAmount, originalAmount: result.order.originalAmount, discountAmount: result.order.discountAmount, couponId: result.order.couponId, couponCode: undefined, expiresAt: result.xrayClient.expiresAt };
    } catch (error) {
      const message = sanitizePanelError(error);
      logger.error("XRAY_CLIENT_CREATE_FAILED", { orderId, deliveryId: orderId, userId: client.userId, productId: client.productId, xrayClientId: client.id, step: "panel_verified", status: "failed", error: message });
      await prisma.xrayClient.update({ where: { id: client.id }, data: { status: "failed", lastError: message } });
      await prisma.order.update({ where: { id: orderId }, data: { status: "failed_delivery" } });
      if (invoiceId) await prisma.paymentInvoice.update({ where: { id: invoiceId }, data: { deliveryStatus: "FAILED_DELIVERY", verifiedAt: new Date(), orderId } });
      await prisma.auditLog.create({ data: { actorId: client.userId, action: "xray_delivery.failed", metadata: JSON.stringify({ orderId, deliveryId: orderId, xrayClientId: client.id, error: message }) } });
      MonitoringService.record({ type: "XRAY_CLIENT_CREATE_FAILED", section: "Xray Delivery", description: message, userId: client.userId, severity: "critical", suggestedAction: "تحویل سرویس Xray را بررسی و دستی retry کنید. کیف پول تا قبل از verify کسر نمی‌شود.", metadata: { orderId, xrayClientId: client.id } });
      throw new Error("ساخت اکانت با مشکل مواجه شد. مبلغی از کیف پول شما کسر نشده / سهمیه تست شما مصرف نشده است. لطفاً دوباره تلاش کنید یا با پشتیبانی تماس بگیرید.");
    }
  }

  static async purchaseProductWithWallet(userId: string, productId: string, couponCode?: string) {
    let result;
    try {
      result = await prisma.$transaction((tx) => this.purchaseProduct(tx, { userId, productId, couponCode, method: "WALLET" }));
      if (result.xrayClient) result = await this.provisionXrayClient(result.order.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/کد تخفیف|کوپن|تخفیف/.test(message)) {
        paymentLog("COUPON_RECHECK_FAILED", { userId, productId, couponCode, reason: message, severity: "warning" });
      } else {
        MonitoringService.record({ type: "PURCHASE_FAILED", section: "Purchase Flow", description: message, userId, severity: "critical", suggestedAction: "موجودی، کیف پول و وضعیت محصول را بررسی کنید.", metadata: { productId, couponCode } });
      }
      throw error;
    }
    AdminService.invalidateDashboardCache();
    eventBus.emit("order.created", { orderId: result.order.id, userId, productId, totalAmount: result.totalAmount });
    eventBus.emit("order.completed", { orderId: result.order.id, userId, productId, totalAmount: result.totalAmount });
    if (result.couponId && result.couponCode) eventBus.emit("coupon.applied", { couponId: result.couponId, code: result.couponCode, userId, orderId: result.order.id, discountAmount: result.discountAmount });
    return result;
  }

  private static async assertUserCanPay(userId: string, tx: DbClient = prisma) {
    const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true, isBanned: true } });
    if (!user) throw new Error("کاربر پیدا نشد");
    if (user.isBanned) throw new Error("حساب شما مسدود است و امکان پرداخت وجود ندارد");
    return user;
  }

  private static async validateProductForPurchase(userId: string, productId?: string, expectedAmount?: number, tx: DbClient = prisma) {
    if (!productId) throw new Error("محصول مشخص نیست");
    const setting = await tx.financialSetting.upsert({ where: { id: "singleton" }, update: {}, create: { id: "singleton", minimumTopupAmount: 100_000 } });
    if (setting.storeStatus !== "active") throw new Error("فروشگاه در حال حاضر غیرفعال است");
    const product = await tx.product.findFirst({ where: { id: productId, AND: [activeProductWhere(), { category: { is: activeCategoryWhere() } }] } });
    if (!product) throw new Error("محصول پیدا نشد");
    if (expectedAmount !== undefined && product.price !== expectedAmount) throw new Error("مبلغ فاکتور با قیمت محصول همخوانی ندارد");
    if (product.mode === "xray_auto" && product.trafficBytes && product.durationDays && product.stockLimit && product.inboundIds.length) {
      if (product.soldCount >= product.stockLimit) throw new Error("موجودی این محصول تمام شده است");
    } else {
      const stock = await tx.productAccount.count({ where: { AND: [availableInventoryWhere(productId), unassignedInventoryWhere()] } });
      if (stock < 1) throw new Error("موجودی این محصول تمام شده است");
    }
    return product;
  }

  static async releaseExpiredReservations(timeoutMinutes = 15) {
    const expiresBefore = new Date(Date.now() - timeoutMinutes * 60_000);
    const expired = await prisma.productAccount.updateMany({
      where: { status: "reserved", reservedAt: { lt: expiresBefore }, soldTo: null, soldAt: null },
      data: { status: "available", reservedBy: null, reservedAt: null },
    });
    if (expired.count > 0) await prisma.auditLog.create({ data: { actorId: "system", action: "Inventory Reservation Released", metadata: JSON.stringify({ count: expired.count, timeoutMinutes }) } });
    return expired.count;
  }
}

export class PaymentInvoiceService {
  static async buildXrayRenewalQuote(userId: string, xrayClientId: string, productId: string) {
    return PaymentService.buildXrayRenewalQuote(userId, xrayClientId, productId);
  }

  static async renewXrayWithWallet(userId: string, xrayClientId: string, productId: string) {
    return PaymentService.renewXrayWithWallet(userId, xrayClientId, productId);
  }

  static async createWalletTopupInvoice(userId: string, amount: number) {
    return PaymentService.createInvoice({ userId, amount, originalAmount: amount, discountAmount: 0, type: "WALLET_TOPUP" });
  }

  static async createProductInvoice(userId: string, productId: string, couponCode?: string) {
    const quote = await prisma.$transaction((tx) => PaymentService.quoteProductInvoice(tx, { userId, productId, couponCode }));
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

  static async createXrayRenewalInvoice(userId: string, xrayClientId: string, productId: string) {
    return PaymentService.createXrayRenewalInvoice(userId, xrayClientId, productId);
  }

  static async processCallback(reference: string | CallbackReference, metadata: Record<string, unknown> = {}) {
    return PaymentService.completePayment(reference, metadata);
  }


  static async markNotification(invoiceId: string, status: "SENT" | "FAILED", metadata: Record<string, unknown> = {}) {
    return PaymentService.markNotification(invoiceId, status, metadata);
  }

  static async list(page = 1, take = 8, status?: PaymentInvoiceStatus, query?: string) {
    const skip = (Math.max(page, 1) - 1) * take;
    const where: Prisma.PaymentInvoiceWhereInput = { ...(status ? { status } : {}) };
    if (query) where.OR = [{ id: query }, { payId: query }, { user: { is: { telegramId: query } } }];
    return Promise.all([
      prisma.paymentInvoice.findMany({ where, include: { user: true, product: true, coupon: true }, orderBy: { createdAt: "desc" }, skip, take }),
      prisma.paymentInvoice.count({ where }),
    ]);
  }

  static async detail(invoiceId: string) {
    return prisma.paymentInvoice.findUnique({ where: { id: invoiceId }, include: { user: true, product: true, coupon: true, order: true, audits: { orderBy: { createdAt: "desc" }, take: 20 } } });
  }

  static async stats() {
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfWeek.getDate() - 6);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const revenueWhere = (from: Date): Prisma.PaymentInvoiceWhereInput => ({ status: "COMPLETED", completedAt: { gte: from } });
    const [total, successful, paid, failed, pending, cancelled, todayRevenue, weeklyRevenue, monthlyRevenue, recent, gateway] = await Promise.all([
      prisma.paymentInvoice.count(),
      prisma.paymentInvoice.count({ where: { status: "COMPLETED" } }),
      prisma.paymentInvoice.count({ where: { status: "PAID" } }),
      prisma.paymentInvoice.count({ where: { status: "FAILED" } }),
      prisma.paymentInvoice.count({ where: { status: "PENDING" } }),
      prisma.paymentInvoice.count({ where: { status: "CANCELED" } }),
      prisma.paymentInvoice.aggregate({ where: revenueWhere(startOfToday), _sum: { amount: true } }),
      prisma.paymentInvoice.aggregate({ where: revenueWhere(startOfWeek), _sum: { amount: true } }),
      prisma.paymentInvoice.aggregate({ where: revenueWhere(startOfMonth), _sum: { amount: true } }),
      prisma.paymentInvoice.findMany({ include: { user: true, product: true, coupon: true }, orderBy: { createdAt: "desc" }, take: 8 }),
      PaymentGatewayService.getConfig(),
    ]);
    return { total, successful, paid, failed, pending, cancelled, todayRevenue: todayRevenue._sum.amount ?? 0, weeklyRevenue: weeklyRevenue._sum.amount ?? 0, monthlyRevenue: monthlyRevenue._sum.amount ?? 0, recent, gatewayStatus: gateway.lastConnectionStatus ?? "unknown" };
  }
}
