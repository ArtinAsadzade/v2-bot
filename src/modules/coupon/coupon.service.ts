import { prisma } from "../../services/prisma";
import { isValidObjectId } from "../../utils/object-id";
import type { Coupon, CouponType, Prisma } from "@prisma/client";

export type CouponCreateInput = {
  code: string;
  type: CouponType;
  value: number;
  expiresAt: Date;
  maxUses: number;
  perUserLimit?: number;
  minimumPurchaseAmount?: number;
  status?: "active" | "inactive";
};

export type CouponCalculation = {
  originalAmount: number;
  discountAmount: number;
  finalAmount: number;
};

export type CouponCart = { productId?: string | null; originalAmount: number };

export type CouponCheckoutValidation =
  | { ok: true; coupon: Coupon; originalAmount: number; discountAmount: number; finalAmount: number }
  | { ok: false; reason: string };

function normalizeCode(code: string) {
  return String(code ?? "").trim().toUpperCase();
}

function couponNeedsProduct(coupon: Pick<Coupon, "productIds" | "categoryIds">) {
  return coupon.productIds.length > 0 || coupon.categoryIds.length > 0;
}

function assertCoupon(data: CouponCreateInput | Partial<CouponCreateInput>) {
  if (data.code !== undefined && !normalizeCode(data.code)) throw new Error("کد کوپن معتبر نیست");
  if (data.type !== undefined && data.type !== "percentage" && data.type !== "fixed") throw new Error("نوع کوپن معتبر نیست");
  if (data.value !== undefined && (!Number.isInteger(data.value) || data.value <= 0)) throw new Error("مقدار تخفیف معتبر نیست");
  if (data.maxUses !== undefined && (!Number.isInteger(data.maxUses) || data.maxUses <= 0)) throw new Error("محدودیت استفاده معتبر نیست");
  if (data.perUserLimit !== undefined && (!Number.isInteger(data.perUserLimit) || data.perUserLimit <= 0)) throw new Error("محدودیت هر کاربر معتبر نیست");
  if (data.minimumPurchaseAmount !== undefined && (!Number.isInteger(data.minimumPurchaseAmount) || data.minimumPurchaseAmount < 0)) throw new Error("حداقل مبلغ خرید معتبر نیست");
  if (data.expiresAt !== undefined && data.expiresAt <= new Date()) throw new Error("تاریخ انقضا باید در آینده باشد");
  if (data.status !== undefined && data.status !== "active" && data.status !== "inactive") throw new Error("وضعیت کوپن معتبر نیست");
}

function assertCouponRules(type: CouponType, value: number, maxUses: number, perUserLimit: number, usedCount = 0) {
  if (type === "percentage" && value > 100) throw new Error("درصد تخفیف نمی‌تواند بیش از ۱۰۰ باشد");
  if (maxUses < usedCount) throw new Error("محدودیت کل نمی‌تواند کمتر از تعداد استفاده‌شده باشد");
  if (perUserLimit > maxUses) throw new Error("محدودیت هر کاربر نمی‌تواند بیشتر از محدودیت کل باشد");
}

export function normalizeCouponCode(code: string) {
  return normalizeCode(code);
}

function couponValue(coupon: Pick<Coupon, "value" | "discountPercent">) {
  return coupon.value || coupon.discountPercent || 0;
}

export class CouponService {
  static calculate(coupon: Coupon, originalAmount: number): CouponCalculation {
    if (!Number.isInteger(originalAmount) || originalAmount < 0) throw new Error("مبلغ سفارش معتبر نیست");
    const value = couponValue(coupon);
    const discountAmount = coupon.type === "fixed" ? Math.min(value, originalAmount) : Math.floor((originalAmount * value) / 100);
    return { originalAmount, discountAmount, finalAmount: Math.max(originalAmount - discountAmount, 0) };
  }

  static async create(code: string, discountPercent: number, expiresAt: Date, maxUses = 10) {
    return this.createAdvanced({ code, type: "percentage", value: discountPercent, expiresAt, maxUses, perUserLimit: 1, minimumPurchaseAmount: 0 });
  }

  static async createAdvanced(data: CouponCreateInput, actorId?: string) {
    assertCoupon(data);
    assertCouponRules(data.type, data.value, data.maxUses, data.perUserLimit ?? 1);
    const type = data.type;
    const normalizedCode = normalizeCode(data.code);
    const coupon = await prisma.coupon.create({
      data: {
        code: normalizedCode,
        type,
        value: data.value,
        discountPercent: type === "percentage" ? data.value : null,
        maxUses: data.maxUses,
        perUserLimit: data.perUserLimit ?? 1,
        minimumPurchaseAmount: data.minimumPurchaseAmount ?? 0,
        expiresAt: data.expiresAt,
        status: data.status ?? "active",
      },
    });
    if (actorId) await prisma.auditLog.create({ data: { actorId, action: "coupon.create", metadata: JSON.stringify({ couponId: coupon.id, code: coupon.code }) } });
    return coupon;
  }

  static async update(couponId: string, data: Partial<CouponCreateInput>, actorId: string) {
    assertCoupon(data);
    const current = await prisma.coupon.findUniqueOrThrow({ where: { id: couponId } });
    if (current.status === "deleted") throw new Error("کوپن حذف‌شده قابل ویرایش نیست");

    const finalType = data.type ?? current.type;
    const finalValue = data.value ?? couponValue(current);
    const finalMaxUses = data.maxUses ?? current.maxUses;
    const finalPerUserLimit = data.perUserLimit ?? current.perUserLimit;
    assertCouponRules(finalType, finalValue, finalMaxUses, finalPerUserLimit, current.usedCount);

    const patch: Prisma.CouponUpdateInput = {};
    if (data.code !== undefined) patch.code = normalizeCode(data.code);
    if (data.type !== undefined) patch.type = data.type;
    if (data.value !== undefined) patch.value = data.value;
    if (data.type !== undefined || data.value !== undefined) patch.discountPercent = finalType === "percentage" ? finalValue : null;
    if (data.maxUses !== undefined) patch.maxUses = data.maxUses;
    if (data.perUserLimit !== undefined) patch.perUserLimit = data.perUserLimit;
    if (data.minimumPurchaseAmount !== undefined) patch.minimumPurchaseAmount = data.minimumPurchaseAmount;
    if (data.expiresAt !== undefined) patch.expiresAt = data.expiresAt;
    if (data.status !== undefined) patch.status = data.status;
    const coupon = await prisma.coupon.update({ where: { id: couponId }, data: patch });
    await prisma.auditLog.create({ data: { actorId, action: "coupon.update", metadata: JSON.stringify({ couponId, fields: Object.keys(patch) }) } });
    return coupon;
  }

  static async setStatus(couponId: string, status: "active" | "inactive", actorId: string) {
    const existing = await prisma.coupon.findUniqueOrThrow({ where: { id: couponId } });
    if (existing.status === "deleted") throw new Error("کوپن حذف‌شده را نمی‌توان فعال یا غیرفعال کرد");
    if (status === "active") {
      if (existing.expiresAt <= new Date()) throw new Error("کوپن منقضی‌شده قابل فعال‌سازی نیست");
      if (existing.usedCount >= existing.maxUses) throw new Error("ظرفیت این کوپن تکمیل شده است");
    }
    const coupon = await prisma.coupon.update({ where: { id: couponId }, data: { status, deletedAt: null } });
    await prisma.auditLog.create({ data: { actorId, action: "coupon.status", metadata: JSON.stringify({ couponId, status }) } });
    return coupon;
  }

  static async softDelete(couponId: string, actorId: string) {
    const coupon = await prisma.coupon.update({ where: { id: couponId }, data: { status: "deleted", deletedAt: new Date() } });
    await prisma.auditLog.create({ data: { actorId, action: "coupon.delete.soft", metadata: JSON.stringify({ couponId }) } });
    return coupon;
  }

  static async hardDelete(couponId: string, actorId: string) {
    return prisma.$transaction(async (tx) => {
      await tx.couponUsage.deleteMany({ where: { couponId } });
      await tx.order.updateMany({ where: { couponId }, data: { couponId: null } });
      const coupon = await tx.coupon.delete({ where: { id: couponId } });
      await tx.auditLog.create({ data: { actorId, action: "coupon.delete.hard", metadata: JSON.stringify({ couponId }) } });
      return coupon;
    });
  }

  static async list(params: { page?: number; take?: number; query?: string; status?: "active" | "inactive" | "deleted" } = {}) {
    const page = Math.max(params.page ?? 1, 1);
    const take = params.take ?? 8;
    const where: Prisma.CouponWhereInput = {
      ...(params.status ? { status: params.status } : { status: { not: "deleted" } }),
      ...(params.query ? { code: { contains: normalizeCode(params.query) } } : {}),
    };
    return Promise.all([prisma.coupon.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * take, take }), prisma.coupon.count({ where })]);
  }

  static validateCouponShape(coupon: Coupon, originalAmount: number, now = new Date()): string | null {
    if (coupon.status === "deleted" || coupon.deletedAt) return "کد تخفیف پیدا نشد";
    if (coupon.status !== "active") return "کد تخفیف غیرفعال است";
    if (coupon.expiresAt <= now) return "کد تخفیف منقضی شده است";
    if (coupon.usedCount >= coupon.maxUses) return "ظرفیت استفاده از این کد به پایان رسیده است";
    if (originalAmount < coupon.minimumPurchaseAmount) return `حداقل مبلغ خرید برای این کد ${coupon.minimumPurchaseAmount.toLocaleString("fa-IR")} تومان است`;
    if (coupon.type !== "percentage" && coupon.type !== "fixed") return "نوع کد تخفیف معتبر نیست";
    const value = couponValue(coupon);
    if (!Number.isInteger(value) || value <= 0) return "مقدار تخفیف معتبر نیست";
    if (coupon.type === "percentage" && value > 100) return "درصد تخفیف معتبر نیست";
    return null;
  }

  static async validateForCheckout(data: { code: string; userId: string; originalAmount: number; productId?: string | null; now?: Date; tx?: Prisma.TransactionClient | typeof prisma }): Promise<CouponCheckoutValidation> {
    const tx = data.tx ?? prisma;
    const now = data.now ?? new Date();
    if (!Number.isInteger(data.originalAmount) || data.originalAmount < 0) return { ok: false, reason: "مبلغ سفارش معتبر نیست" };
    const normalizedCode = normalizeCode(data.code);
    if (!normalizedCode) return { ok: false, reason: "کد تخفیف وارد نشده است" };
    const coupon = await tx.coupon.findUnique({ where: { code: normalizedCode } });
    if (!coupon) return { ok: false, reason: "کد تخفیف نامعتبر است." };
    const shapeError = this.validateCouponShape(coupon, data.originalAmount, now);
    if (shapeError) return { ok: false, reason: shapeError };
    let product: { id: string; categoryId: string } | null = null;
    if (couponNeedsProduct(coupon)) {
      if (!data.productId) return { ok: false, reason: "برای استفاده از کد تخفیف، ابتدا یک سرویس را انتخاب کنید." };
      if (!isValidObjectId(data.productId)) return { ok: false, reason: "این کد برای سرویس انتخاب‌شده قابل استفاده نیست." };
      product = await tx.product.findUnique({ where: { id: data.productId }, select: { id: true, categoryId: true } });
      if (!product) return { ok: false, reason: "این کد برای سرویس انتخاب‌شده قابل استفاده نیست." };
      const productMatches = coupon.productIds.length === 0 || coupon.productIds.includes(product.id);
      const categoryMatches = coupon.categoryIds.length === 0 || coupon.categoryIds.includes(product.categoryId);
      if (!productMatches || !categoryMatches) return { ok: false, reason: "این کد برای سرویس انتخاب‌شده قابل استفاده نیست." };
    }
    const usedByUser = await tx.couponUsage.count({ where: { couponId: coupon.id, userId: data.userId } });
    if (usedByUser >= coupon.perUserLimit) return { ok: false, reason: "شما قبلاً از این کد استفاده کرده‌اید." };
    const calculation = this.calculate(coupon, data.originalAmount);
    if (calculation.discountAmount > data.originalAmount || calculation.finalAmount < 0) return { ok: false, reason: "مبلغ نهایی معتبر نیست" };
    return { ok: true, coupon, ...calculation };
  }

  static async validateCouponForCart(userId: string, code: string, cart: CouponCart, tx: Prisma.TransactionClient | typeof prisma = prisma) {
    return this.validateForCheckout({ code, userId, originalAmount: cart.originalAmount, productId: cart.productId, tx });
  }

  static async validateForUser(code: string, userId: string, tx: Prisma.TransactionClient = prisma, originalAmount = 0) {
    const result = await this.validateForCheckout({ code, userId, originalAmount, tx });
    if (!result.ok) throw new Error(result.reason);
    return result.coupon;
  }
}
