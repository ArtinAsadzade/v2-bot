import crypto from "crypto";
import type { Prisma } from "@prisma/client";
import { PaymentInvoiceStatus, PaymentInvoiceType } from "@prisma/client";
import { prisma } from "../../services/prisma";
import { WalletService } from "../wallet/wallet.service";
import { ProductService } from "../product/product.service";
import { AdminService } from "../admin/admin.service";
import { activeCategoryWhere, activeProductWhere, availableInventoryWhere, unassignedInventoryWhere } from "../product/visibility";

export type PaymentGatewayInput = {
  enabled?: boolean;
  apiBaseUrl?: string;
  apiKey?: string;
  callbackUrl?: string;
  gatewayName?: string;
  displayOrder?: number;
};

type TxClient = Prisma.TransactionClient;

const CALLBACK_TOKEN_PARAM = "invoice_id";
const CALLBACK_SECRET_PARAM = "token";

function assertPositiveAmount(amount: number) {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error("مبلغ پرداخت معتبر نیست");
}

function normalizeBaseUrl(url: string) {
  return url.trim().replace(/\/+$/, "");
}

function validateUrl(value: string, label: string) {
  try {
    const parsed = new URL(value);
    if (!/^https?:$/.test(parsed.protocol)) throw new Error();
  } catch {
    throw new Error(`${label} معتبر نیست`);
  }
}

function parseGatewayResponse(body: unknown) {
  if (!body || typeof body !== "object") throw new Error("پاسخ درگاه معتبر نیست");
  const data = body as Record<string, unknown>;
  const nested = typeof data.data === "object" && data.data ? (data.data as Record<string, unknown>) : data;
  const payId = String(nested.pay_id ?? nested.payId ?? nested.id ?? "").trim();
  const paymentLink = String(nested.payment_link ?? nested.paymentLink ?? nested.link ?? nested.url ?? "").trim();
  const gatewayAmount = Number(nested.price ?? nested.amount ?? data.price ?? data.amount ?? 0);
  if (!payId || !paymentLink) throw new Error("شناسه یا لینک پرداخت از درگاه دریافت نشد");
  validateUrl(paymentLink, "لینک پرداخت");
  return { payId, paymentLink, gatewayAmount: Number.isFinite(gatewayAmount) && gatewayAmount > 0 ? Math.round(gatewayAmount) : undefined };
}

function invoiceCallbackUrl(baseCallbackUrl: string, invoiceId: string, callbackToken: string) {
  const withId = baseCallbackUrl.includes("{invoiceId}") ? baseCallbackUrl.split("{invoiceId}").join(encodeURIComponent(invoiceId)) : baseCallbackUrl;
  const url = new URL(withId);
  url.searchParams.set(CALLBACK_TOKEN_PARAM, invoiceId);
  url.searchParams.set(CALLBACK_SECRET_PARAM, callbackToken);
  return url.toString();
}

async function audit(tx: TxClient, data: { userId?: string | null; invoiceId: string; action: string; metadata?: Record<string, unknown> }) {
  await tx.paymentAuditLog.create({
    data: {
      userId: data.userId ?? undefined,
      invoiceId: data.invoiceId,
      action: data.action,
      metadata: data.metadata ? JSON.stringify(data.metadata) : undefined,
    },
  });
}

export class PaymentGatewayService {
  static async get() {
    return prisma.paymentGatewayConfig.upsert({
      where: { id: "singleton" },
      update: {},
      create: { id: "singleton", enabled: false, apiBaseUrl: "", apiKey: "", callbackUrl: "", gatewayName: "پرداخت آنی", displayOrder: 1 },
    });
  }

  static validateConfig(input: PaymentGatewayInput & { enabled?: boolean }) {
    if (input.enabled) {
      if (!input.apiBaseUrl?.trim()) throw new Error("آدرس API درگاه الزامی است");
      if (!input.apiKey?.trim()) throw new Error("کلید API درگاه الزامی است");
      if (!input.callbackUrl?.trim()) throw new Error("آدرس callback درگاه الزامی است");
      validateUrl(input.apiBaseUrl, "آدرس API درگاه");
      validateUrl(input.callbackUrl, "آدرس callback درگاه");
    }
  }

  static async update(input: PaymentGatewayInput, actorId: string) {
    const current = await this.get();
    const next = { ...current, ...input };
    this.validateConfig(next);
    const updated = await prisma.paymentGatewayConfig.update({
      where: { id: "singleton" },
      data: {
        enabled: input.enabled ?? current.enabled,
        apiBaseUrl: input.apiBaseUrl !== undefined ? normalizeBaseUrl(input.apiBaseUrl) : current.apiBaseUrl,
        apiKey: input.apiKey !== undefined ? input.apiKey.trim() : current.apiKey,
        callbackUrl: input.callbackUrl !== undefined ? input.callbackUrl.trim() : current.callbackUrl,
        gatewayName: input.gatewayName !== undefined ? input.gatewayName.trim() || "پرداخت آنی" : current.gatewayName,
        displayOrder: input.displayOrder ?? current.displayOrder,
      },
    });
    await prisma.auditLog.create({ data: { actorId, action: "payment_gateway.update", metadata: JSON.stringify({ enabled: updated.enabled, gatewayName: updated.gatewayName, displayOrder: updated.displayOrder }) } });
    return updated;
  }

  static async setEnabled(enabled: boolean, actorId: string) {
    const current = await this.get();
    this.validateConfig({ ...current, enabled });
    const updated = await prisma.paymentGatewayConfig.update({ where: { id: "singleton" }, data: { enabled } });
    await prisma.auditLog.create({ data: { actorId, action: enabled ? "payment_gateway.enable" : "payment_gateway.disable", metadata: JSON.stringify({ gatewayName: updated.gatewayName }) } });
    return updated;
  }
}

export class PaymentInvoiceService {
  static async createWalletTopupInvoice(userId: string, amount: number) {
    assertPositiveAmount(amount);
    return this.createInvoice({ userId, amount, type: "WALLET_TOPUP" });
  }

  static async createProductInvoice(userId: string, productId: string) {
    const product = await ProductService.getProduct(productId);
    if (!product) throw new Error("محصول پیدا نشد");
    const stock = await ProductService.availableStock(productId);
    if (stock < 1) throw new Error("موجودی این محصول تمام شده است");
    return this.createInvoice({ userId, amount: product.price, type: "PRODUCT_PURCHASE", productId });
  }

  private static async createInvoice(data: { userId: string; amount: number; type: PaymentInvoiceType; productId?: string }) {
    const gateway = await PaymentGatewayService.get();
    if (!gateway.enabled) throw new Error("پرداخت آنی در حال حاضر غیرفعال است");
    PaymentGatewayService.validateConfig(gateway);

    const invoice = await prisma.paymentInvoice.create({
      data: { userId: data.userId, amount: data.amount, gatewayAmount: data.amount, callbackToken: crypto.randomBytes(32).toString("hex"), type: data.type, status: "PENDING", productId: data.productId },
    });
    await prisma.paymentAuditLog.create({ data: { userId: data.userId, invoiceId: invoice.id, action: "Invoice Created", metadata: JSON.stringify({ type: data.type, amount: data.amount }) } });

    const callbackUrl = invoiceCallbackUrl(gateway.callbackUrl, invoice.id, invoice.callbackToken);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      const response = await fetch(`${normalizeBaseUrl(gateway.apiBaseUrl)}/invoice/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-KEY": gateway.apiKey },
        body: JSON.stringify({ price: data.amount, callback_url: callbackUrl }),
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout));
      if (!response.ok) throw new Error(`Gateway error ${response.status}`);
      const parsed = parseGatewayResponse(await response.json());
      return prisma.paymentInvoice.update({
        where: { id: invoice.id },
        data: { payId: parsed.payId, paymentLink: parsed.paymentLink, gatewayAmount: parsed.gatewayAmount ?? data.amount },
      });
    } catch (error) {
      await prisma.paymentInvoice.update({ where: { id: invoice.id }, data: { status: "FAILED" } });
      await prisma.paymentAuditLog.create({ data: { userId: data.userId, invoiceId: invoice.id, action: "Payment Failed", metadata: JSON.stringify({ stage: "create", error: error instanceof Error ? error.message : String(error) }) } });
      throw new Error("ارتباط با درگاه پرداخت برقرار نشد. لطفاً چند دقیقه دیگر دوباره تلاش کنید");
    }
  }

  static async processCallback(invoiceId: string, metadata: Record<string, unknown> = {}) {
    if (!invoiceId) return { statusCode: 404, text: "Payment invoice not found." };
    const invoice = await prisma.paymentInvoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) return { statusCode: 404, text: "Payment invoice not found." };

    await prisma.paymentAuditLog.create({ data: { userId: invoice.userId, invoiceId: invoice.id, action: "Callback Received", metadata: JSON.stringify(metadata) } });

    if (metadata.token !== invoice.callbackToken) {
      await prisma.paymentAuditLog.create({ data: { userId: invoice.userId, invoiceId: invoice.id, action: "Payment Failed", metadata: JSON.stringify({ stage: "callback_security", reason: "invalid_callback_token" }) } });
      return { statusCode: 403, text: "Invalid payment callback." };
    }

    if (invoice.status === "COMPLETED") return { statusCode: 200, text: "Payment already processed." };
    if (invoice.status !== "PENDING") return { statusCode: 200, text: "Payment already processed." };

    const locked = await prisma.paymentInvoice.updateMany({
      where: { id: invoice.id, status: "PENDING" },
      data: { status: "PAID", paidAt: new Date(), verifiedAt: new Date() },
    });
    if (locked.count !== 1) return { statusCode: 200, text: "Payment already processed." };

    try {
      const result = await prisma.$transaction(async (tx) => {
        const fresh = await tx.paymentInvoice.findUniqueOrThrow({ where: { id: invoice.id } });
        if (fresh.status !== "PAID") throw new Error("Payment already processed.");
        if (fresh.type === "WALLET_TOPUP") {
          const user = await WalletService.credit(fresh.userId, fresh.amount, `شارژ کیف پول با پرداخت آنی - فاکتور ${fresh.id}`, tx);
          await audit(tx, { userId: fresh.userId, invoiceId: fresh.id, action: "Payment Verified", metadata: { payId: fresh.payId } });
          await audit(tx, { userId: fresh.userId, invoiceId: fresh.id, action: "Wallet Credited", metadata: { amount: fresh.amount, balance: user.balance } });
          const completed = await tx.paymentInvoice.update({ where: { id: fresh.id }, data: { status: "COMPLETED", completedAt: new Date(), verifiedAt: new Date() } });
          return { invoice: completed, user, type: fresh.type as PaymentInvoiceType };
        }

        const delivered = await this.deliverProduct(tx, fresh);
        await audit(tx, { userId: fresh.userId, invoiceId: fresh.id, action: "Payment Verified", metadata: { payId: fresh.payId } });
        await audit(tx, { userId: fresh.userId, invoiceId: fresh.id, action: "Product Delivered", metadata: { productId: fresh.productId, orderId: delivered.order.id, accountId: delivered.account.id } });
        const completed = await tx.paymentInvoice.update({ where: { id: fresh.id }, data: { status: "COMPLETED", completedAt: new Date(), verifiedAt: new Date(), orderId: delivered.order.id } });
        return { invoice: completed, ...delivered, type: fresh.type as PaymentInvoiceType };
      });
      AdminService.invalidateDashboardCache();
      return { statusCode: 200, text: "Payment completed successfully.", result };
    } catch (error) {
      await prisma.paymentInvoice.updateMany({ where: { id: invoice.id, status: "PAID" }, data: { status: "FAILED", verifiedAt: new Date() } });
      await prisma.paymentAuditLog.create({ data: { userId: invoice.userId, invoiceId: invoice.id, action: "Payment Failed", metadata: JSON.stringify({ stage: "process", error: error instanceof Error ? error.message : String(error) }) } });
      return { statusCode: 500, text: "Payment processing failed." };
    }
  }

  private static async deliverProduct(tx: TxClient, invoice: { id: string; userId: string; productId: string | null; amount: number }) {
    if (!invoice.productId) throw new Error("محصول فاکتور مشخص نیست");
    const product = await tx.product.findFirst({ where: { id: invoice.productId, AND: [activeProductWhere(), { category: { is: activeCategoryWhere() } }] } });
    if (!product) throw new Error("محصول پیدا نشد");
    if (product.price !== invoice.amount) throw new Error("مبلغ فاکتور با قیمت محصول همخوانی ندارد");
    const account = await tx.productAccount.findFirst({ where: { AND: [availableInventoryWhere(product.id), unassignedInventoryWhere()] }, orderBy: { createdAt: "asc" } });
    if (!account) throw new Error("موجودی این محصول تمام شده است");
    const reservedAt = new Date();
    const reserved = await tx.productAccount.updateMany({ where: { id: account.id, AND: [availableInventoryWhere(product.id), unassignedInventoryWhere()] }, data: { status: "reserved", reservedBy: invoice.userId, reservedAt } });
    if (reserved.count !== 1) throw new Error("این اکانت هم‌اکنون رزرو شد؛ دوباره تلاش کنید");
    await tx.productAccountHistory.create({ data: { accountId: account.id, actorId: invoice.userId, action: "account.reserve.payment", fromValue: "available", toValue: "reserved", metadata: JSON.stringify({ invoiceId: invoice.id, productId: product.id, reservedAt }) } });
    const order = await tx.order.create({ data: { userId: invoice.userId, productId: product.id, originalAmount: product.price, totalAmount: product.price, finalPaidAmount: product.price, discountAmount: 0, status: "completed" } });
    const purchaseDate = new Date();
    const durationDays = account.durationDays ?? product.duration;
    const expiresAt = new Date(purchaseDate.getTime() + durationDays * 86_400_000);
    const orderItem = await tx.orderItem.create({ data: { orderId: order.id, productId: product.id, productAccountId: account.id, deliveredUsername: account.username, deliveredPassword: account.password, deliveredSubscriptionLink: account.subscriptionLink, deliveredConfigLink: account.configLink, deliveredConfig: account.configLink || account.config, purchaseDate, expiresAt, isActive: true } });
    const soldAt = new Date();
    const sold = await tx.productAccount.updateMany({ where: { id: account.id, productId: product.id, status: "reserved", reservedBy: invoice.userId, AND: [unassignedInventoryWhere()] }, data: { status: "sold", soldTo: invoice.userId, soldAt, reservedBy: null, reservedAt: null } });
    if (sold.count !== 1) throw new Error("تحویل اکانت ناموفق بود");
    await tx.productAccountHistory.create({ data: { accountId: account.id, actorId: invoice.userId, action: "account.deliver.payment", fromValue: "reserved", toValue: "sold", metadata: JSON.stringify({ invoiceId: invoice.id, orderId: order.id, orderItemId: orderItem.id, productId: product.id, soldAt, expiresAt }) } });
    const deliveredAccount = await tx.productAccount.findUniqueOrThrow({ where: { id: account.id } });
    return { order, product, account: deliveredAccount, orderItem, expiresAt };
  }

  static async list(page = 1, take = 8, status?: PaymentInvoiceStatus, query?: string) {
    const skip = (Math.max(page, 1) - 1) * take;
    const where: Prisma.PaymentInvoiceWhereInput = { ...(status ? { status } : {}) };
    if (query) {
      where.OR = [{ id: query }, { payId: query }, { user: { is: { telegramId: query } } }];
    }
    return Promise.all([
      prisma.paymentInvoice.findMany({ where, include: { user: true, product: true }, orderBy: { createdAt: "desc" }, skip, take }),
      prisma.paymentInvoice.count({ where }),
    ]);
  }

  static async detail(invoiceId: string) {
    return prisma.paymentInvoice.findUnique({ where: { id: invoiceId }, include: { user: true, product: true, order: true, audits: { orderBy: { createdAt: "desc" }, take: 20 } } });
  }

  static async stats() {
    const [successful, failed, pending, recent] = await Promise.all([
      prisma.paymentInvoice.count({ where: { status: "COMPLETED" } }),
      prisma.paymentInvoice.count({ where: { status: "FAILED" } }),
      prisma.paymentInvoice.count({ where: { status: "PENDING" } }),
      prisma.paymentInvoice.findMany({ include: { user: true, product: true }, orderBy: { createdAt: "desc" }, take: 5 }),
    ]);
    return { successful, failed, pending, recent };
  }
}
