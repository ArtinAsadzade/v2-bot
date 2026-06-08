import crypto from "crypto";
import type { Prisma, PaymentInvoice } from "@prisma/client";
import { PaymentInvoiceStatus, PaymentInvoiceType } from "@prisma/client";
import { prisma } from "../../services/prisma";
import { WalletService } from "../wallet/wallet.service";
import { ProductService } from "../product/product.service";
import { CouponService } from "../coupon/coupon.service";
import { AdminService } from "../admin/admin.service";
import { eventBus } from "../../services/event-bus.service";
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
type DbClient = TxClient | typeof prisma;

type AuditData = { userId?: string | null; invoiceId?: string | null; action: string; metadata?: Record<string, unknown>; actorId?: string };

type PurchaseMethod = "WALLET" | "INSTANT";

const CALLBACK_TOKEN_PARAM = "invoice_id";
const CALLBACK_SECRET_PARAM = "token";
const ALREADY_PROCESSED_FA = "⚠️ این پرداخت قبلاً پردازش شده است.";

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

async function audit(tx: DbClient, data: AuditData) {
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

export class PaymentService {
  static alreadyProcessedMessage = ALREADY_PROCESSED_FA;

  static async createInvoice(data: { userId: string; amount: number; type: PaymentInvoiceType; productId?: string }) {
    assertPositiveAmount(data.amount);
    const gateway = await PaymentGatewayService.get();
    if (!gateway.enabled) throw new Error("پرداخت آنی در حال حاضر غیرفعال است");
    PaymentGatewayService.validateConfig(gateway);

    await this.assertUserCanPay(data.userId);
    if (data.type === "PRODUCT_PURCHASE") await this.validateProductForPurchase(data.userId, data.productId, data.amount);

    const invoice = await prisma.paymentInvoice.create({
      data: { userId: data.userId, amount: data.amount, gatewayAmount: data.amount, callbackToken: crypto.randomBytes(32).toString("hex"), type: data.type, status: "PENDING", productId: data.productId },
    });
    await audit(prisma, { userId: data.userId, invoiceId: invoice.id, action: "Invoice Created", metadata: { type: data.type, amount: data.amount } });

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
      if (parsed.gatewayAmount !== undefined && parsed.gatewayAmount !== data.amount) throw new Error("مبلغ ثبت‌شده درگاه با فاکتور همخوانی ندارد");
      return prisma.paymentInvoice.update({ where: { id: invoice.id }, data: { payId: parsed.payId, paymentLink: parsed.paymentLink, gatewayAmount: data.amount } });
    } catch (error) {
      await prisma.paymentInvoice.update({ where: { id: invoice.id }, data: { status: "FAILED" } });
      await audit(prisma, { userId: data.userId, invoiceId: invoice.id, action: "Payment Failed", metadata: { stage: "create", error: error instanceof Error ? error.message : String(error) } });
      throw new Error("ارتباط با درگاه پرداخت برقرار نشد. لطفاً چند دقیقه دیگر دوباره تلاش کنید");
    }
  }

  static async verifyPayment(invoice: PaymentInvoice, metadata: Record<string, unknown>) {
    if (metadata.token !== invoice.callbackToken) {
      await audit(prisma, { userId: invoice.userId, invoiceId: invoice.id, action: "Payment Failed", metadata: { stage: "callback_security", reason: "invalid_callback_token" } });
      return false;
    }
    if (invoice.gatewayAmount !== null && invoice.gatewayAmount !== invoice.amount) {
      await audit(prisma, { userId: invoice.userId, invoiceId: invoice.id, action: "Payment Failed", metadata: { stage: "callback_security", reason: "amount_mismatch", gatewayAmount: invoice.gatewayAmount, amount: invoice.amount } });
      return false;
    }
    return true;
  }

  static async completePayment(invoiceId: string, metadata: Record<string, unknown> = {}) {
    if (!invoiceId) return { statusCode: 404, text: "Payment invoice not found." };
    const invoice = await prisma.paymentInvoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) return { statusCode: 404, text: "Payment invoice not found." };

    await audit(prisma, { userId: invoice.userId, invoiceId: invoice.id, action: "Callback Received", metadata });
    if (!(await this.verifyPayment(invoice, metadata))) return { statusCode: 403, text: "Invalid payment callback." };

    if (invoice.status !== "PENDING") return { statusCode: 200, text: ALREADY_PROCESSED_FA };

    try {
      const result = await prisma.$transaction(async (tx) => {
        const locked = await tx.paymentInvoice.updateMany({
          where: { id: invoice.id, status: "PENDING" },
          data: { status: "PAID", paidAt: new Date(), verifiedAt: new Date() },
        });
        if (locked.count !== 1) return { alreadyProcessed: true as const };

        const fresh = await tx.paymentInvoice.findUniqueOrThrow({ where: { id: invoice.id } });
        if (fresh.status !== "PAID") return { alreadyProcessed: true as const };
        await audit(tx, { userId: fresh.userId, invoiceId: fresh.id, action: "Payment Verified", metadata: { payId: fresh.payId, amount: fresh.amount } });

        if (fresh.type === "WALLET_TOPUP") {
          const user = await this.creditWallet(tx, { userId: fresh.userId, amount: fresh.amount, reason: `شارژ کیف پول با پرداخت آنی - فاکتور ${fresh.id}`, actorId: fresh.userId, invoiceId: fresh.id, referenceId: `invoice:${fresh.id}` });
          const completed = await tx.paymentInvoice.update({ where: { id: fresh.id }, data: { status: "COMPLETED", completedAt: new Date(), verifiedAt: new Date() } });
          return { invoice: completed, user, type: fresh.type as PaymentInvoiceType };
        }

        const delivered = await this.purchaseProduct(tx, { userId: fresh.userId, productId: fresh.productId ?? "", method: "INSTANT", invoice: fresh });
        const completed = await tx.paymentInvoice.update({ where: { id: fresh.id }, data: { status: "COMPLETED", completedAt: new Date(), verifiedAt: new Date(), orderId: delivered.order.id } });
        return { invoice: completed, ...delivered, type: fresh.type as PaymentInvoiceType };
      });
      if ("alreadyProcessed" in result) return { statusCode: 200, text: ALREADY_PROCESSED_FA };
      AdminService.invalidateDashboardCache();
      return { statusCode: 200, text: "Payment completed successfully.", result };
    } catch (error) {
      await prisma.paymentInvoice.updateMany({ where: { id: invoice.id, status: { in: ["PENDING", "PAID"] } }, data: { status: "FAILED", verifiedAt: new Date() } });
      await audit(prisma, { userId: invoice.userId, invoiceId: invoice.id, action: "Payment Failed", metadata: { stage: "process", error: error instanceof Error ? error.message : String(error) } });
      return { statusCode: 500, text: "Payment processing failed." };
    }
  }

  static async creditWallet(tx: TxClient, data: { userId: string; amount: number; reason: string; actorId: string; invoiceId?: string; referenceId?: string }) {
    const user = await WalletService.credit(data.userId, data.amount, data.reason, tx, { actorId: data.actorId, referenceId: data.referenceId });
    await audit(tx, { userId: data.userId, invoiceId: data.invoiceId, action: "Wallet Credited", actorId: data.actorId, metadata: { amount: data.amount, balance: user.balance, reason: data.reason, referenceId: data.referenceId } });
    return user;
  }

  static async debitWallet(tx: TxClient, data: { userId: string; amount: number; reason: string; actorId: string; invoiceId?: string; referenceId?: string }) {
    const user = await WalletService.debit(data.userId, data.amount, data.reason, tx, { actorId: data.actorId, referenceId: data.referenceId });
    await audit(tx, { userId: data.userId, invoiceId: data.invoiceId, action: "Wallet Debited", actorId: data.actorId, metadata: { amount: data.amount, balance: user.balance, reason: data.reason, referenceId: data.referenceId } });
    return user;
  }

  static async purchaseProduct(
    tx: TxClient,
    data: { userId: string; productId: string; couponCode?: string; method: PurchaseMethod; invoice?: Pick<PaymentInvoice, "id" | "amount" | "productId" | "userId" | "status"> },
  ) {
    if (!data.productId) throw new Error("محصول فاکتور مشخص نیست");
    await this.assertUserCanPay(data.userId, tx);
    const product = await this.validateProductForPurchase(data.userId, data.productId, data.invoice?.amount, tx);

    let discountAmount = 0;
    let couponId: string | null = null;
    let couponMaxUses = 0;
    const originalAmount = product.price;
    let totalAmount = originalAmount;

    if (data.couponCode) {
      if (data.method !== "WALLET") throw new Error("کد تخفیف فقط برای پرداخت با کیف پول پشتیبانی می‌شود");
      const coupon = await CouponService.validateForUser(data.couponCode, data.userId, tx, originalAmount);
      couponId = coupon.id;
      couponMaxUses = coupon.maxUses;
      const calculation = CouponService.calculate(coupon, originalAmount);
      discountAmount = calculation.discountAmount;
      totalAmount = calculation.finalAmount;
    }

    if (data.invoice) {
      if (data.invoice.userId !== data.userId || data.invoice.productId !== data.productId) throw new Error("فاکتور با خرید همخوانی ندارد");
      if (data.invoice.amount !== totalAmount) throw new Error("مبلغ فاکتور با مبلغ خرید همخوانی ندارد");
      if (data.invoice.status !== "PAID") throw new Error("پرداخت تایید نشده است");
    }

    const account = await tx.productAccount.findFirst({ where: { AND: [availableInventoryWhere(product.id), unassignedInventoryWhere()] }, orderBy: { createdAt: "asc" } });
    if (!account) throw new Error("موجودی این محصول تمام شده است");

    const reservedAt = new Date();
    const reserved = await tx.productAccount.updateMany({ where: { id: account.id, AND: [availableInventoryWhere(product.id), unassignedInventoryWhere()] }, data: { status: "reserved", reservedBy: data.userId, reservedAt } });
    if (reserved.count !== 1) throw new Error("این اکانت هم‌اکنون رزرو شد؛ دوباره تلاش کنید");
    await tx.productAccountHistory.create({ data: { accountId: account.id, actorId: data.userId, action: "Inventory Reserved", fromValue: "available", toValue: "reserved", metadata: JSON.stringify({ invoiceId: data.invoice?.id, productId: product.id, reservedAt, method: data.method }) } });
    await audit(tx, { userId: data.userId, invoiceId: data.invoice?.id, action: "Inventory Reserved", metadata: { accountId: account.id, productId: product.id, method: data.method } });

    if (data.method === "WALLET" && totalAmount > 0) {
      await this.debitWallet(tx, { userId: data.userId, amount: totalAmount, reason: `خرید محصول ${product.title}`, actorId: data.userId, referenceId: `purchase:${data.userId}:${product.id}:${reservedAt.getTime()}` });
    }

    if (couponId) {
      const couponUpdated = await tx.coupon.updateMany({ where: { id: couponId, status: "active", deletedAt: null, usedCount: { lt: couponMaxUses }, expiresAt: { gt: new Date() } }, data: { usedCount: { increment: 1 } } });
      if (couponUpdated.count !== 1) throw new Error("کد تخفیف دیگر قابل استفاده نیست");
    }

    const order = await tx.order.create({ data: { userId: data.userId, productId: product.id, couponId, originalAmount, totalAmount, finalPaidAmount: totalAmount, discountAmount, status: "completed" } });
    const purchaseDate = new Date();
    const durationDays = account.durationDays ?? product.duration;
    const expiresAt = new Date(purchaseDate.getTime() + durationDays * 86_400_000);
    const orderItem = await tx.orderItem.create({ data: { orderId: order.id, productId: product.id, productAccountId: account.id, deliveredUsername: account.username, deliveredPassword: account.password, deliveredSubscriptionLink: account.subscriptionLink, deliveredConfigLink: account.configLink, deliveredConfig: account.configLink || account.config, purchaseDate, expiresAt, isActive: true } });

    if (couponId) {
      const usageSlot = await tx.couponUsage.count({ where: { couponId, userId: data.userId } });
      if (usageSlot >= (await tx.coupon.findUniqueOrThrow({ where: { id: couponId }, select: { perUserLimit: true } })).perUserLimit) throw new Error("سقف استفاده شما از این کد تخفیف تکمیل شده است");
      await tx.couponUsage.create({ data: { couponId, userId: data.userId, orderId: order.id, usageSlot } });
      await audit(tx, { userId: data.userId, invoiceId: data.invoice?.id, action: "Coupon Used", metadata: { couponId, orderId: order.id, usageSlot, originalAmount, discountAmount, finalAmount: totalAmount } });
    }

    const soldAt = new Date();
    const sold = await tx.productAccount.updateMany({ where: { id: account.id, productId: product.id, status: "reserved", reservedBy: data.userId, AND: [unassignedInventoryWhere()] }, data: { status: "sold", soldTo: data.userId, soldAt, reservedBy: null, reservedAt: null } });
    if (sold.count !== 1) throw new Error("تحویل اکانت ناموفق بود");
    await tx.productAccountHistory.create({ data: { accountId: account.id, actorId: data.userId, action: "Inventory Sold", fromValue: "reserved", toValue: "sold", metadata: JSON.stringify({ invoiceId: data.invoice?.id, orderId: order.id, orderItemId: orderItem.id, productId: product.id, soldAt, expiresAt, method: data.method }) } });
    await audit(tx, { userId: data.userId, invoiceId: data.invoice?.id, action: "Product Purchased", metadata: { productId: product.id, orderId: order.id, accountId: account.id, method: data.method, originalAmount, discountAmount, finalAmount: totalAmount } });
    await audit(tx, { userId: data.userId, invoiceId: data.invoice?.id, action: "Inventory Sold", metadata: { accountId: account.id, orderId: order.id } });

    const deliveredAccount = await tx.productAccount.findUniqueOrThrow({ where: { id: account.id } });
    return { order, product, account: deliveredAccount, orderItem, totalAmount, originalAmount, discountAmount, couponId, couponCode: data.couponCode, expiresAt };
  }

  static async purchaseProductWithWallet(userId: string, productId: string, couponCode?: string) {
    const result = await prisma.$transaction((tx) => this.purchaseProduct(tx, { userId, productId, couponCode, method: "WALLET" }));
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
    const stock = await tx.productAccount.count({ where: { AND: [availableInventoryWhere(productId), unassignedInventoryWhere()] } });
    if (stock < 1) throw new Error("موجودی این محصول تمام شده است");
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
  static async createWalletTopupInvoice(userId: string, amount: number) {
    return PaymentService.createInvoice({ userId, amount, type: "WALLET_TOPUP" });
  }

  static async createProductInvoice(userId: string, productId: string) {
    const product = await ProductService.getProduct(productId);
    if (!product) throw new Error("محصول پیدا نشد");
    return PaymentService.createInvoice({ userId, amount: product.price, type: "PRODUCT_PURCHASE", productId });
  }

  static async processCallback(invoiceId: string, metadata: Record<string, unknown> = {}) {
    return PaymentService.completePayment(invoiceId, metadata);
  }

  static async list(page = 1, take = 8, status?: PaymentInvoiceStatus, query?: string) {
    const skip = (Math.max(page, 1) - 1) * take;
    const where: Prisma.PaymentInvoiceWhereInput = { ...(status ? { status } : {}) };
    if (query) where.OR = [{ id: query }, { payId: query }, { user: { is: { telegramId: query } } }];
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
