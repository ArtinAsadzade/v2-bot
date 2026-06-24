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
import { XrayDiagnosticsService } from "../xray/xray-diagnostics.service";
import {
  assertProductDeliverySuccess,
  type InvoiceNotificationPayload,
  type PaymentGatewayInput,
  type ProductDeliveryFailure,
  type ProductDeliveryResult,
  type ProductDeliverySuccess,
  type ProductInvoiceQuote,
  type PurchaseMethod,
  type TxClient,
} from "./payment.types";
import { assertInvoiceAmountIntegrity, assertPositiveAmount, resolveInvoiceAmounts } from "./payment-amounts";
import { audit, rawPaymentInvoiceProjection, type DbClient } from "./payment-repository";
import {
  assertValidHttpUrl,
  DuplicateGatewayPayIdError,
  GatewayConnectionError,
  GatewayHttpError,
  invoiceCallbackUrl,
  normalizeBaseUrl,
  requestGatewayInvoice,
  safeJson,
} from "./gateway-payment.service";
import { PaymentCallbackService, type CallbackReference } from "./payment-callback.service";
import { WalletPaymentService } from "./wallet-payment.service";
import { paymentLog } from "./payment-logging";
import { PaymentDiscountService } from "./payment-discount.service";
import { PaymentNotificationService } from "./payment-notification.service";
import { PaymentFulfillmentService } from "./payment-fulfillment.service";
import { PaymentDeliveryService } from "./payment-delivery.service";
export type {
  DeliveredAccount,
  InvoiceNotificationPayload,
  PaymentGatewayInput,
  ProductDeliveryFailure,
  ProductDeliveryResult,
  ProductDeliverySuccess,
  ProductInvoiceQuote,
  PurchaseMethod,
} from "./payment.types";

function envSeconds(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function purchasePendingTtlSeconds() {
  return envSeconds("PURCHASE_PENDING_TTL_SECONDS", 15 * 60);
}
function invoicePendingTtlSeconds() {
  return envSeconds("INVOICE_PENDING_TTL_SECONDS", 30 * 60);
}

const ALREADY_PROCESSED_FA = "⚠️ این پرداخت قبلاً پردازش شده است.";
const DEFAULT_GATEWAY_API_BASE_URL = "http://136.244.104.77:5000/api/v1";

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

export function maskApiKey(apiKey?: string | null) {
  if (!apiKey) return "ثبت نشده";
  const suffix = apiKey.slice(-4).toUpperCase();
  return `********${suffix}`;
}

export class PaymentGatewayService {
  private static readonly singletonId = "singleton";

  static async getConfig() {
    return prisma.$transaction(async (tx) => {
      await tx.paymentGatewayConfig.upsert({
        where: { id: this.singletonId },
        update: {},
        create: {
          id: this.singletonId,
          enabled: false,
          apiBaseUrl: DEFAULT_GATEWAY_API_BASE_URL,
          apiKey: "",
          callbackUrl: "",
          gatewayName: "پرداخت آنی",
          displayOrder: 1,
        },
      });
      return tx.paymentGatewayConfig.findUniqueOrThrow({ where: { id: this.singletonId } });
    });
  }

  static async get() {
    return this.getConfig();
  }

  static validateConfig(input: PaymentGatewayInput & { enabled?: boolean }, options: { partial?: boolean } = {}) {
    if (input.apiBaseUrl !== undefined && (options.partial || input.apiBaseUrl.trim()))
      assertValidHttpUrl(input.apiBaseUrl, "آدرس API درگاه", { normalizeBase: true });
    if (input.callbackUrl !== undefined && (options.partial || input.callbackUrl.trim()))
      assertValidHttpUrl(input.callbackUrl, "آدرس callback درگاه");
    if (options.partial && input.apiKey !== undefined && !input.apiKey.trim()) throw new Error("کلید API درگاه الزامی است");
    if (input.gatewayName !== undefined && !input.gatewayName.trim()) throw new Error("نام درگاه الزامی است");
    if (input.displayOrder !== undefined && (!Number.isInteger(input.displayOrder) || input.displayOrder < 1))
      throw new Error("ترتیب نمایش معتبر نیست");

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
      create: {
        id: this.singletonId,
        enabled: false,
        apiBaseUrl: DEFAULT_GATEWAY_API_BASE_URL,
        apiKey: "",
        callbackUrl: "",
        gatewayName: "پرداخت آنی",
        displayOrder: 1,
      },
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
    const callbackUrl = invoiceCallbackUrl(gateway.callbackUrl, {
      invoiceId: `test-${Date.now()}`,
      callbackToken: crypto.randomBytes(16).toString("hex"),
    });
    try {
      const { parsed, raw } = await PaymentService.requestGatewayInvoice(gateway, 1_000, callbackUrl);
      const reloaded = await prisma.$transaction(async (tx) => {
        await tx.paymentGatewayConfig.update({
          where: { id: this.singletonId },
          data: { lastSuccessfulRequest: new Date(), lastConnectionStatus: "success", lastConnectionError: null },
        });
        await tx.auditLog.create({
          data: { actorId, action: "payment_gateway.connection_test.success", metadata: JSON.stringify({ payId: parsed.payId, status: "success" }) },
        });
        return tx.paymentGatewayConfig.findUniqueOrThrow({ where: { id: this.singletonId } });
      });
      return { ok: true as const, message: "✅ اتصال با موفقیت برقرار شد", details: raw, config: reloaded };
    } catch (error) {
      const message = this.connectionFailureMessage(error);
      const reloaded = await prisma.$transaction(async (tx) => {
        await tx.paymentGatewayConfig.update({
          where: { id: this.singletonId },
          data: { lastFailedRequest: new Date(), lastConnectionStatus: "failed", lastConnectionError: message },
        });
        await tx.auditLog.create({
          data: { actorId, action: "payment_gateway.connection_test.failed", metadata: JSON.stringify({ error: message }) },
        });
        return tx.paymentGatewayConfig.findUniqueOrThrow({ where: { id: this.singletonId } });
      });
      return { ok: false as const, message: `❌ ${message}`, error: message, config: reloaded };
    }
  }
}

export class PaymentService {
  static alreadyProcessedMessage = ALREADY_PROCESSED_FA;

  static async requestGatewayInvoice(gateway: { apiBaseUrl: string; apiKey: string }, price: number, callbackUrl: string) {
    return requestGatewayInvoice(gateway, price, callbackUrl);
  }

  private static async confirmCouponUsage(tx: TxClient, data: Parameters<typeof PaymentDiscountService.confirmCouponUsage>[1]) {
    return PaymentDiscountService.confirmCouponUsage(tx, data);
  }

  static async resolveExistingPurchaseIntent(userId: string, productId: string) {
    const now = new Date();
    const invoiceCutoff = new Date(now.getTime() - invoicePendingTtlSeconds() * 1000);
    const purchaseCutoff = new Date(now.getTime() - purchasePendingTtlSeconds() * 1000);
    const invoice = await prisma.paymentInvoice.findFirst({
      where: { userId, productId, type: "PRODUCT_PURCHASE", status: { in: ["PENDING", "PAID"] } },
      orderBy: { createdAt: "desc" },
    });
    if (invoice) {
      if (invoice.status === "PENDING" && invoice.createdAt < invoiceCutoff) {
        await prisma.paymentInvoice.updateMany({
          where: { id: invoice.id, status: "PENDING" },
          data: { status: "EXPIRED", deliveryStatus: "EXPIRED" },
        });
        await audit(prisma, {
          userId,
          invoiceId: invoice.id,
          action: "PURCHASE_INTENT_EXPIRED",
          metadata: { reason: "invoice_ttl", productId, invoicePendingTtlSeconds: invoicePendingTtlSeconds() },
        });
        await this.releaseExpiredReservations(Math.ceil(purchasePendingTtlSeconds() / 60));
        return { action: "expired_and_released" as const, invoice };
      }
      if (invoice.status === "PENDING" && invoice.paymentLink) return { action: "reuse_invoice" as const, invoice };
      if (invoice.status === "PENDING") return { action: "processing" as const, invoice, canCancel: true };
      if (invoice.status === "PAID") return { action: "processing" as const, invoice, canCancel: false };
    }
    const order = await prisma.order.findFirst({
      where: { userId, productId, status: { in: ["pending", "reserving", "panel_creating", "panel_verified"] } },
      include: { xrayClients: true, items: true },
      orderBy: { createdAt: "desc" },
    });
    if (order) {
      if (order.createdAt < purchaseCutoff) {
        const hasPanelWork = order.xrayClients.some((client) => client.status === "creating" || client.status === "active" || client.panelClientId);
        await prisma.order.update({ where: { id: order.id }, data: { status: hasPanelWork ? "failed_delivery" : "cancelled" } });
        await prisma.xrayClient.updateMany({
          where: { orderId: order.id, status: { in: ["provisioning", "creating"] } },
          data: {
            status: hasPanelWork ? "orphaned_panel_client" : "failed",
            lastError: hasPanelWork ? "stale_purchase_orphaned_panel_client" : "stale_purchase_expired",
          },
        });
        await this.releaseExpiredReservations(Math.ceil(purchasePendingTtlSeconds() / 60));
        await prisma.auditLog.create({
          data: {
            actorId: userId,
            action: hasPanelWork ? "purchase.delivery_requires_admin" : "purchase.expired",
            metadata: JSON.stringify({ orderId: order.id, productId, purchasePendingTtlSeconds: purchasePendingTtlSeconds() }),
          },
        });
        return { action: "expired_and_released" as const, order };
      }
      return { action: "processing" as const, order, canCancel: true };
    }
    return { action: "none" as const };
  }

  static async cancelExistingPurchaseIntent(userId: string, productId: string) {
    const invoice = await prisma.paymentInvoice.findFirst({
      where: { userId, productId, type: "PRODUCT_PURCHASE", status: "PENDING" },
      orderBy: { createdAt: "desc" },
    });
    if (invoice) {
      await prisma.paymentInvoice.update({ where: { id: invoice.id }, data: { status: "CANCELED", deliveryStatus: "CANCELED" } });
      await audit(prisma, { userId, invoiceId: invoice.id, action: "PURCHASE_INTENT_CANCELED_BY_USER", metadata: { productId } });
    }
    const order = await prisma.order.findFirst({
      where: { userId, productId, status: { in: ["pending", "reserving"] } },
      orderBy: { createdAt: "desc" },
    });
    if (order) await prisma.order.update({ where: { id: order.id }, data: { status: "cancelled" } });
    await this.releaseExpiredReservations(Math.ceil(purchasePendingTtlSeconds() / 60));
    return { invoice, order };
  }

  static async quoteProductInvoice(tx: DbClient, data: { userId: string; productId: string; couponCode?: string }): Promise<ProductInvoiceQuote> {
    const product = await this.validateProductForPurchase(data.userId, data.productId, undefined, tx);
    const originalAmount = product.price;
    let discountAmount = 0;
    let finalAmount = originalAmount;
    let couponId: string | null = null;
    let couponCode: string | null = null;
    if (data.couponCode?.trim()) {
      const validation = await CouponService.validateForCheckout({
        code: data.couponCode,
        userId: data.userId,
        originalAmount,
        productId: data.productId,
        tx,
      });
      if (!validation.ok) {
        paymentLog("COUPON_RECHECK_FAILED", {
          userId: data.userId,
          productId: data.productId,
          couponCode: normalizeCouponCode(data.couponCode),
          reason: validation.reason,
          severity: "warning",
        });
        await audit(tx, {
          userId: data.userId,
          action: "COUPON_RECHECK_FAILED",
          metadata: { productId: data.productId, couponCode: normalizeCouponCode(data.couponCode), reason: validation.reason, severity: "warning" },
        });
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

  static assertInvoiceAmountIntegrity(invoice: Pick<PaymentInvoice, "amount" | "originalAmount" | "discountAmount" | "gatewayAmount">) {
    return assertInvoiceAmountIntegrity(invoice);
  }

  private static isUniqueConstraintError(error: unknown, field: string) {
    return (
      error instanceof PrismaClientKnownRequestError &&
      error.code === "P2002" &&
      Array.isArray(error.meta?.target) &&
      error.meta.target.includes(field)
    );
  }

  private static async attachGatewayInvoiceResponse(
    invoice: PaymentInvoice,
    gatewayResult: { parsed: { payId: string; paymentLink: string }; raw: unknown },
    gatewayAmount: number,
  ) {
    const duplicate = await prisma.paymentInvoice.findFirst({
      where: { payId: gatewayResult.parsed.payId, NOT: { id: invoice.id } },
      select: { id: true, userId: true, status: true },
    });
    if (duplicate) {
      paymentLog("PAYMENT_GATEWAY_DUPLICATE_PAY_ID", {
        invoiceId: invoice.id,
        userId: invoice.userId,
        payId: gatewayResult.parsed.payId,
        duplicateInvoiceId: duplicate.id,
      });
      await audit(prisma, {
        userId: invoice.userId,
        invoiceId: invoice.id,
        action: "PAYMENT_GATEWAY_DUPLICATE_PAY_ID",
        metadata: {
          payId: gatewayResult.parsed.payId,
          duplicateInvoiceId: duplicate.id,
          duplicateUserId: duplicate.userId,
          duplicateStatus: duplicate.status,
        },
      });
      throw new DuplicateGatewayPayIdError(gatewayResult.parsed.payId, duplicate.id);
    }

    try {
      paymentLog("PAYMENT_INVOICE_UPDATE_PAYID", { invoiceId: invoice.id, userId: invoice.userId, payId: gatewayResult.parsed.payId, gatewayAmount });
      await audit(prisma, {
        userId: invoice.userId,
        invoiceId: invoice.id,
        action: "PAYMENT_INVOICE_UPDATE_PAYID",
        metadata: { payId: gatewayResult.parsed.payId, gatewayAmount },
      });
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
        await audit(prisma, {
          userId: current.userId,
          invoiceId: current.id,
          action: "PAYMENT_LINK_READY",
          metadata: { payId: current.payId, idempotent: true },
        });
        return current;
      }
      throw new Error("فاکتور دیگر قابل اتصال به پاسخ درگاه نیست");
    } catch (error) {
      if (this.isUniqueConstraintError(error, "payId")) {
        const racedDuplicate = await prisma.paymentInvoice.findFirst({
          where: { payId: gatewayResult.parsed.payId, NOT: { id: invoice.id } },
          select: { id: true, userId: true, status: true },
        });
        paymentLog("PAYMENT_GATEWAY_DUPLICATE_PAY_ID", {
          invoiceId: invoice.id,
          userId: invoice.userId,
          payId: gatewayResult.parsed.payId,
          duplicateInvoiceId: racedDuplicate?.id,
          race: true,
        });
        await audit(prisma, {
          userId: invoice.userId,
          invoiceId: invoice.id,
          action: "PAYMENT_GATEWAY_DUPLICATE_PAY_ID",
          metadata: {
            payId: gatewayResult.parsed.payId,
            duplicateInvoiceId: racedDuplicate?.id,
            duplicateUserId: racedDuplicate?.userId,
            duplicateStatus: racedDuplicate?.status,
            race: true,
          },
        });
        throw new DuplicateGatewayPayIdError(gatewayResult.parsed.payId, racedDuplicate?.id ?? "unknown");
      }
      throw error;
    }
  }

  static async createInvoice(data: {
    userId: string;
    amount: number;
    type: PaymentInvoiceType;
    productId?: string;
    originalAmount?: number;
    discountAmount?: number;
    couponId?: string | null;
    couponCode?: string | null;
    renewalId?: string;
    renewalXrayClientId?: string;
  }) {
    assertPositiveAmount(data.amount);
    const gateway = await PaymentGatewayService.get();
    if (!gateway.enabled) throw new Error("پرداخت آنی در حال حاضر غیرفعال است");
    PaymentGatewayService.validateConfig(gateway);

    await this.assertUserCanPay(data.userId);
    if (data.type === "PRODUCT_PURCHASE") await this.validateProductForPurchase(data.userId, data.productId, undefined);

    const { originalAmount, discountAmount } = resolveInvoiceAmounts(data);

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
    await audit(prisma, {
      userId: data.userId,
      invoiceId: invoice.id,
      action: "PAYMENT_INVOICE_CREATED",
      metadata: {
        type: data.type,
        originalAmount,
        discountAmount,
        finalAmount: data.amount,
        couponId: data.couponId,
        couponCode: data.couponCode,
        status: "PENDING",
      },
    });
    if (data.couponId)
      await audit(prisma, {
        userId: data.userId,
        invoiceId: invoice.id,
        action: "COUPON_APPLIED",
        metadata: {
          couponId: data.couponId,
          couponCode: data.couponCode,
          originalAmount,
          discountAmount,
          finalAmount: data.amount,
          usageRecorded: false,
        },
      });

    const callbackUrl = invoiceCallbackUrl(gateway.callbackUrl, { invoiceId: invoice.id, callbackToken: invoice.callbackToken });
    paymentLog("PAYMENT_GATEWAY_REQUEST", {
      invoiceId: invoice.id,
      userId: data.userId,
      endpoint: "/invoice/create",
      price: data.amount,
      callbackUrl,
    });
    await audit(prisma, {
      userId: data.userId,
      invoiceId: invoice.id,
      action: "PAYMENT_GATEWAY_REQUEST",
      metadata: { endpoint: "/invoice/create", price: data.amount, callback_url: callbackUrl },
    });
    try {
      const gatewayResult = await this.requestGatewayInvoice(gateway, data.amount, callbackUrl);
      paymentLog("PAYMENT_INVOICE_GATEWAY_RESPONSE", {
        invoiceId: invoice.id,
        userId: data.userId,
        payId: gatewayResult.parsed.payId,
        paymentLink: gatewayResult.parsed.paymentLink,
      });
      await audit(prisma, {
        userId: data.userId,
        invoiceId: invoice.id,
        action: "PAYMENT_INVOICE_GATEWAY_RESPONSE",
        metadata: gatewayResult.raw as Record<string, unknown>,
      });
      const updatedInvoice = await this.attachGatewayInvoiceResponse(invoice, gatewayResult, data.amount);
      await prisma.paymentGatewayConfig.update({
        where: { id: "singleton" },
        data: { lastSuccessfulRequest: new Date(), lastConnectionStatus: "success", lastConnectionError: null },
      });
      paymentLog("PAYMENT_LINK_READY", {
        invoiceId: updatedInvoice.id,
        userId: updatedInvoice.userId,
        payId: updatedInvoice.payId,
        paymentLink: updatedInvoice.paymentLink,
      });
      await audit(prisma, {
        userId: updatedInvoice.userId,
        invoiceId: updatedInvoice.id,
        action: "PAYMENT_LINK_READY",
        metadata: { payId: updatedInvoice.payId, paymentLink: updatedInvoice.paymentLink },
      });
      return updatedInvoice;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      paymentLog("PAYMENT_GATEWAY_REQUEST_FAILED", { invoiceId: invoice.id, userId: data.userId, stage: "gateway_create", error: message });
      await prisma.paymentInvoice.update({
        where: { id: invoice.id },
        data: { gatewayResponse: safeJson({ error: message }), deliveryStatus: "GATEWAY_REQUEST_FAILED" },
      });
      await prisma.paymentGatewayConfig.update({
        where: { id: "singleton" },
        data: { lastFailedRequest: new Date(), lastConnectionStatus: "failed", lastConnectionError: message },
      });
      await audit(prisma, {
        userId: data.userId,
        invoiceId: invoice.id,
        action: "PAYMENT_GATEWAY_REQUEST_FAILED",
        metadata: { stage: "gateway_create", error: message },
      });
      if (error instanceof DuplicateGatewayPayIdError) {
        MonitoringService.record({
          type: "PAYMENT_FAILED",
          section: "Payment Gateway",
          description: `Duplicate gateway pay_id: ${error.payId}`,
          userId: data.userId,
          severity: "critical",
          suggestedAction: "درگاه پرداخت و یکتایی pay_id را بررسی کنید.",
          metadata: { invoiceId: invoice.id, duplicateInvoiceId: error.existingInvoiceId },
        });
        await prisma.paymentInvoice.update({
          where: { id: invoice.id },
          data: {
            gatewayResponse: safeJson({ error: error.message, payId: error.payId, duplicateInvoiceId: error.existingInvoiceId }),
            deliveryStatus: "DUPLICATE_GATEWAY_PAY_ID",
          },
        });
        throw new Error("پاسخ درگاه پرداخت معتبر نبود. موضوع ثبت شد و پشتیبانی در حال بررسی است.");
      }
      MonitoringService.record({
        type: "PAYMENT_FAILED",
        section: "Payment Gateway",
        description: message,
        userId: data.userId,
        severity: "critical",
        suggestedAction: "وضعیت API درگاه، کلید API و شبکه سرور را بررسی کنید.",
        metadata: { invoiceId: invoice.id, stage: "gateway_create" },
      });
      throw new Error("ارتباط با درگاه پرداخت برقرار نشد. لطفاً چند دقیقه دیگر دوباره تلاش کنید");
    }
  }

  private static notificationInvoice(invoice: Pick<PaymentInvoice, "id" | "userId" | "amount">) {
    return PaymentNotificationService.notificationInvoice(invoice);
  }

  private static async productNotificationPayload(invoice: Pick<PaymentInvoice, "id" | "userId" | "amount">, delivery: any) {
    return PaymentNotificationService.productNotificationPayload(invoice, delivery);
  }

  static async productCallbackResult(invoice: Pick<PaymentInvoice, "id" | "userId" | "amount">, purchaseResult: any) {
    return PaymentNotificationService.productCallbackResult(invoice, purchaseResult);
  }

  static walletTopupNotificationPayload(invoice: Pick<PaymentInvoice, "id" | "userId" | "amount">, user: { balance: number }) {
    return PaymentNotificationService.walletTopupNotificationPayload(invoice, user);
  }

  static async existingCompletedResult(invoiceId: string) {
    return PaymentNotificationService.existingCompletedResult(invoiceId);
  }

  static async completePayment(reference: string | CallbackReference, metadata: Record<string, unknown> = {}) {
    return PaymentCallbackService.completePayment(reference, metadata, {
      existingCompletedResult: (invoiceId) => this.existingCompletedResult(invoiceId),
      finalizePaidProductPurchase: (data) => this.finalizePaidProductPurchase(data),
      fulfillPaidInvoice: (invoiceId) => this.fulfillPaidInvoice(invoiceId),
      provisionXrayClient: (orderId, invoiceId) => this.provisionXrayClient(orderId, invoiceId),
      walletTopupNotificationPayload: (invoice, user) => this.walletTopupNotificationPayload(invoice, user),
      productCallbackResult: (invoice, purchaseResult) => this.productCallbackResult(invoice, purchaseResult),
    });
  }

  static async fulfillPaidInvoice(invoiceId: string) {
    return PaymentFulfillmentService.fulfillPaidInvoice(this.fulfillmentDeps(), invoiceId);
  }

  static async buildXrayRenewalQuote(userId: string, xrayClientId: string, productId: string) {
    const [client, product] = await Promise.all([
      prisma.xrayClient.findFirstOrThrow({ where: { id: xrayClientId, userId }, include: { product: true } }),
      prisma.product.findFirstOrThrow({ where: { id: productId, mode: "xray_auto", isActive: true, deletedAt: null } }),
    ]);
    if (!product.trafficBytes || !product.durationDays) throw new Error("پلن تمدید Xray کامل نیست");
    let traffic: any = null;
    let liveOk = true;
    try {
      traffic = await XrayClientService.traffic(client.clientEmail);
    } catch {
      liveOk = false;
    }
    const snapshot = xrayTrafficSnapshot(traffic, client.trafficBytes, client.usedBytes);
    const now = new Date();
    const baseExpiry = client.expiresAt > now ? client.expiresAt : now;
    const newExpiry = new Date(baseExpiry.getTime() + product.durationDays * 86_400_000);
    const newTotalBytes = snapshot.totalBytes + product.trafficBytes;
    return {
      client,
      currentProduct: client.product,
      product,
      ...snapshot,
      newTotalBytes,
      oldExpiry: client.expiresAt,
      newExpiry,
      addTrafficBytes: product.trafficBytes,
      addDays: product.durationDays,
      liveOk,
    };
  }

  static async renewXrayWithWallet(userId: string, xrayClientId: string, productId: string) {
    const quote = await this.buildXrayRenewalQuote(userId, xrayClientId, productId);
    const renewal = await prisma.$transaction(async (tx) => {
      await this.assertUserCanPay(userId, tx);
      const walletUser = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { balance: true } });
      if (walletUser.balance < quote.product.price) throw new Error("موجودی کیف پول کافی نیست");
      const created = await tx.xrayRenewal.create({
        data: {
          userId,
          xrayClientId,
          renewalProductId: productId,
          oldTotalBytes: quote.totalBytes,
          newTotalBytes: quote.newTotalBytes,
          oldExpiry: quote.oldExpiry,
          newExpiry: quote.newExpiry,
          oldUsedBytes: quote.usedBytes,
          oldRemainingBytes: quote.remainingBytes,
          addTrafficBytes: quote.addTrafficBytes,
          addDays: quote.addDays,
          status: "provisioning",
        },
      });
      await this.debitWallet(tx, {
        userId,
        amount: quote.product.price,
        reason: `تمدید سرویس Xray ${quote.client.clientEmail}`,
        actorId: userId,
        referenceId: `xray-renewal:${created.id}`,
      });
      return created;
    });
    return this.applyXrayRenewal(renewal.id);
  }

  static async createXrayRenewalInvoice(userId: string, xrayClientId: string, productId: string) {
    const quote = await this.buildXrayRenewalQuote(userId, xrayClientId, productId);
    const renewal = await prisma.xrayRenewal.create({
      data: {
        userId,
        xrayClientId,
        renewalProductId: productId,
        oldTotalBytes: quote.totalBytes,
        newTotalBytes: quote.newTotalBytes,
        oldExpiry: quote.oldExpiry,
        newExpiry: quote.newExpiry,
        oldUsedBytes: quote.usedBytes,
        oldRemainingBytes: quote.remainingBytes,
        addTrafficBytes: quote.addTrafficBytes,
        addDays: quote.addDays,
        status: "provisioning",
      },
    });
    const invoice = await this.createInvoice({
      userId,
      amount: quote.product.price,
      originalAmount: quote.product.price,
      discountAmount: 0,
      type: "XRAY_RENEWAL",
      productId,
      renewalId: renewal.id,
      renewalXrayClientId: xrayClientId,
    });
    await prisma.xrayRenewal.update({ where: { id: renewal.id }, data: { invoiceId: invoice.id } });
    return invoice;
  }

  private static async fulfillXrayRenewal(invoiceId: string) {
    const invoice = await prisma.paymentInvoice.findUniqueOrThrow({ where: { id: invoiceId } });
    const renewal = invoice.renewalId
      ? await prisma.xrayRenewal.findUniqueOrThrow({ where: { id: invoice.renewalId }, include: { xrayClient: true, renewalProduct: true } })
      : await prisma.xrayRenewal.findFirstOrThrow({ where: { invoiceId }, include: { xrayClient: true, renewalProduct: true } });
    const updated = await this.applyXrayRenewal(renewal.id, invoiceId);
    const completed = await prisma.paymentInvoice.update({
      where: { id: invoiceId },
      data: { status: "COMPLETED", completedAt: new Date(), verifiedAt: new Date(), deliveryStatus: "COMPLETED" },
    });
    return { invoice: completed, renewal: updated, xrayClient: updated.xrayClient };
  }

  private static async applyXrayRenewal(renewalId: string, invoiceId?: string) {
    const renewal = await prisma.xrayRenewal.findUniqueOrThrow({ where: { id: renewalId }, include: { xrayClient: true, renewalProduct: true } });
    if (renewal.status === "active") return renewal;
    try {
      await XrayClientService.updateClient(renewal.xrayClient.clientEmail, {
        totalBytes: renewal.newTotalBytes,
        expiresAt: renewal.newExpiry,
        telegramId: renewal.xrayClient.telegramId,
        limitIp: renewal.xrayClient.limitIp ?? renewal.renewalProduct.xrayLimitIp ?? 0,
        groupName: renewal.xrayClient.groupName ?? renewal.renewalProduct.xrayGroupName,
      });
      const [, updatedRenewal] = await prisma.$transaction([
        prisma.xrayClient.update({
          where: { id: renewal.xrayClientId },
          data: {
            trafficBytes: renewal.newTotalBytes,
            expiresAt: renewal.newExpiry,
            limitIp: renewal.xrayClient.limitIp ?? renewal.renewalProduct.xrayLimitIp ?? 0,
            groupName: renewal.xrayClient.groupName ?? renewal.renewalProduct.xrayGroupName,
            status: "active",
            lastError: null,
          },
        }),
        prisma.xrayRenewal.update({
          where: { id: renewal.id },
          data: { status: "active", lastError: null, invoiceId: invoiceId ?? renewal.invoiceId },
        }),
      ]);
      return prisma.xrayRenewal.findUniqueOrThrow({ where: { id: updatedRenewal.id }, include: { xrayClient: true, renewalProduct: true } });
    } catch (error) {
      const message = sanitizePanelError(error);
      await prisma.xrayRenewal.update({
        where: { id: renewal.id },
        data: { status: "renewal_failed", lastError: message, invoiceId: invoiceId ?? renewal.invoiceId },
      });
      await prisma.xrayClient.update({ where: { id: renewal.xrayClientId }, data: { status: "renewal_failed", lastError: message } });
      MonitoringService.record({
        type: "PAYMENT_DELIVERY_FAILED",
        section: "Xray Renewal",
        description: message,
        userId: renewal.userId,
        severity: "critical",
        suggestedAction: "تمدید پرداخت‌شده را از پنل بررسی و دستی اعمال کنید.",
        metadata: { renewalId: renewal.id, invoiceId },
      });
      throw new Error("پرداخت موفق بود اما تمدید سرویس نیازمند بررسی است.");
    }
  }

  static async markNotification(invoiceId: string, status: "SENT" | "FAILED", metadata: Record<string, unknown> = {}) {
    const invoice = await prisma.paymentInvoice.update({ where: { id: invoiceId }, data: { notificationStatus: status } });
    paymentLog(status === "SENT" ? "PAYMENT_NOTIFICATION_SENT" : "PAYMENT_NOTIFICATION_FAILED", { invoiceId, userId: invoice.userId, ...metadata });
    await audit(prisma, {
      userId: invoice.userId,
      invoiceId,
      action: status === "SENT" ? "PAYMENT_NOTIFICATION_SENT" : "PAYMENT_NOTIFICATION_FAILED",
      metadata,
    });
    return invoice;
  }

  static async creditWallet(
    tx: TxClient,
    data: { userId: string; amount: number; reason: string; actorId: string; invoiceId?: string; referenceId?: string },
  ) {
    const user = await WalletService.credit(data.userId, data.amount, data.reason, tx, { actorId: data.actorId, referenceId: data.referenceId });
    await audit(tx, {
      userId: data.userId,
      invoiceId: data.invoiceId,
      action: "WALLET_CREDITED",
      actorId: data.actorId,
      metadata: { amount: data.amount, balance: user.balance, reason: data.reason, referenceId: data.referenceId },
    });
    return user;
  }

  static async debitWallet(
    tx: TxClient,
    data: { userId: string; amount: number; reason: string; actorId: string; invoiceId?: string; referenceId?: string },
  ) {
    const user = await WalletService.debit(data.userId, data.amount, data.reason, tx, { actorId: data.actorId, referenceId: data.referenceId });
    await audit(tx, {
      userId: data.userId,
      invoiceId: data.invoiceId,
      action: "Wallet Debited",
      actorId: data.actorId,
      metadata: { amount: data.amount, balance: user.balance, reason: data.reason, referenceId: data.referenceId },
    });
    return user;
  }

  private static deliveryDeps() {
    return {
      assertUserCanPay: (userId: string, tx?: DbClient) => PaymentService.assertUserCanPay(userId, tx),
      validateProductForPurchase: (userId: string, productId?: string, expectedAmount?: number, tx?: DbClient) =>
        PaymentService.validateProductForPurchase(userId, productId, expectedAmount, tx),
      debitWallet: (tx: TxClient, data: Parameters<typeof PaymentService.debitWallet>[1]) => PaymentService.debitWallet(tx, data),
    };
  }

  private static fulfillmentDeps() {
    return {
      creditWallet: (tx: TxClient, data: Parameters<typeof PaymentService.creditWallet>[1]) => PaymentService.creditWallet(tx, data),
      fulfillXrayRenewal: (invoiceId: string) => PaymentService.fulfillXrayRenewal(invoiceId),
      deliveryDeps: PaymentService.deliveryDeps(),
    };
  }

  static async purchaseProduct(tx: TxClient, data: Parameters<typeof PaymentDeliveryService.purchaseProduct>[2]): Promise<ProductDeliveryResult> {
    return PaymentDeliveryService.purchaseProduct(this.deliveryDeps(), tx, data);
  }

  static async provisionXrayClient(orderId: string, invoiceId?: string) {
    return PaymentDeliveryService.provisionXrayClient(this.deliveryDeps(), orderId, invoiceId);
  }

  static async finalizePaidProductPurchase(data: {
    userId: string;
    productId: string;
    invoiceId?: string;
    paymentSource: PurchaseMethod;
    couponCode?: string | null;
  }): Promise<any> {
    return PaymentFulfillmentService.finalizePaidProductPurchase(this.fulfillmentDeps(), data);
  }

  static async purchaseProductWithWallet(userId: string, productId: string, couponCode?: string) {
    return WalletPaymentService.purchaseProductWithWallet(userId, productId, couponCode, {
      finalizePaidProductPurchase: (data) => this.finalizePaidProductPurchase(data),
    });
  }

  private static async assertUserCanPay(userId: string, tx: DbClient = prisma) {
    const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true, isBanned: true } });
    if (!user) throw new Error("کاربر پیدا نشد");
    if (user.isBanned) throw new Error("حساب شما مسدود است و امکان پرداخت وجود ندارد");
    return user;
  }

  private static async validateProductForPurchase(userId: string, productId?: string, expectedAmount?: number, tx: DbClient = prisma) {
    if (!productId) throw new Error("محصول مشخص نیست");
    const setting = await tx.financialSetting.upsert({
      where: { id: "singleton" },
      update: {},
      create: { id: "singleton", minimumTopupAmount: 100_000 },
    });
    if (setting.storeStatus !== "active") throw new Error("فروشگاه در حال حاضر غیرفعال است");
    const product = await tx.product.findFirst({
      where: { id: productId, AND: [activeProductWhere(), { category: { is: activeCategoryWhere() } }] },
    });
    if (!product) throw new Error("محصول پیدا نشد");
    if (expectedAmount !== undefined && product.price !== expectedAmount) throw new Error("مبلغ فاکتور با قیمت محصول همخوانی ندارد");
    if (product.mode === "xray_auto" && product.trafficBytes && product.durationDays && product.stockLimit && product.inboundIds.length) {
      if (product.soldCount >= product.stockLimit) throw new Error("موجودی این محصول تمام شده است");
      const inbounds = await XrayDiagnosticsService.listPanelInbounds();
      const validInboundIds = new Set(inbounds.map((inbound) => inbound.id));
      if (product.inboundIds.some((id) => !validInboundIds.has(id))) throw new Error("اینباندهای محصول Xray با پنل فعلی همخوانی ندارد");
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
    if (expired.count > 0)
      await prisma.auditLog.create({
        data: { actorId: "system", action: "Inventory Reservation Released", metadata: JSON.stringify({ count: expired.count, timeoutMinutes }) },
      });
    return expired.count;
  }
}

export class PaymentInvoiceService {
  static async purchaseProductWithWallet(userId: string, productId: string, couponCode?: string) {
    return PaymentService.purchaseProductWithWallet(userId, productId, couponCode);
  }

  static async buildXrayRenewalQuote(userId: string, xrayClientId: string, productId: string) {
    return PaymentService.buildXrayRenewalQuote(userId, xrayClientId, productId);
  }

  static async renewXrayWithWallet(userId: string, xrayClientId: string, productId: string) {
    return PaymentService.renewXrayWithWallet(userId, xrayClientId, productId);
  }

  static async createWalletTopupInvoice(userId: string, amount: number) {
    return PaymentService.createInvoice({ userId, amount, originalAmount: amount, discountAmount: 0, type: "WALLET_TOPUP" });
  }

  static async createProductInvoice(userId: string, productId: string, couponCode?: string, options: { ignoreExisting?: boolean } = {}) {
    if (!options.ignoreExisting) {
      const existing = await PaymentService.resolveExistingPurchaseIntent(userId, productId);
      if (existing.action === "reuse_invoice") return existing.invoice;
      if (existing.action === "processing") throw new Error("خرید قبلی شما هنوز باز است. لطفاً ابتدا وضعیت سفارش قبلی را از صفحه پیگیری مشخص کنید.");
    }
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

  static async resolveExistingPurchaseIntent(userId: string, productId: string) {
    return PaymentService.resolveExistingPurchaseIntent(userId, productId);
  }

  static async cancelExistingPurchaseIntent(userId: string, productId: string) {
    return PaymentService.cancelExistingPurchaseIntent(userId, productId);
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
    return prisma.paymentInvoice.findUnique({
      where: { id: invoiceId },
      include: { user: true, product: true, coupon: true, order: true, audits: { orderBy: { createdAt: "desc" }, take: 20 } },
    });
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
    return {
      total,
      successful,
      paid,
      failed,
      pending,
      cancelled,
      todayRevenue: todayRevenue._sum.amount ?? 0,
      weeklyRevenue: weeklyRevenue._sum.amount ?? 0,
      monthlyRevenue: monthlyRevenue._sum.amount ?? 0,
      recent,
      gatewayStatus: gateway.lastConnectionStatus ?? "unknown",
    };
  }
}
