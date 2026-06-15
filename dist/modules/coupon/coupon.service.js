"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CouponService = void 0;
exports.normalizeCouponCode = normalizeCouponCode;
const prisma_1 = require("../../services/prisma");
function normalizeCode(code) {
    return code.trim().toUpperCase();
}
function assertCoupon(data) {
    if (data.code !== undefined && !normalizeCode(data.code))
        throw new Error("کد کوپن معتبر نیست");
    if (data.type !== undefined && data.type !== "percentage" && data.type !== "fixed")
        throw new Error("نوع کوپن معتبر نیست");
    if (data.value !== undefined && (!Number.isInteger(data.value) || data.value <= 0))
        throw new Error("مقدار تخفیف معتبر نیست");
    if (data.maxUses !== undefined && (!Number.isInteger(data.maxUses) || data.maxUses <= 0))
        throw new Error("محدودیت استفاده معتبر نیست");
    if (data.perUserLimit !== undefined && (!Number.isInteger(data.perUserLimit) || data.perUserLimit <= 0))
        throw new Error("محدودیت هر کاربر معتبر نیست");
    if (data.minimumPurchaseAmount !== undefined && (!Number.isInteger(data.minimumPurchaseAmount) || data.minimumPurchaseAmount < 0))
        throw new Error("حداقل مبلغ خرید معتبر نیست");
    if (data.expiresAt !== undefined && data.expiresAt <= new Date())
        throw new Error("تاریخ انقضا باید در آینده باشد");
    if (data.status !== undefined && data.status !== "active" && data.status !== "inactive")
        throw new Error("وضعیت کوپن معتبر نیست");
}
function assertCouponRules(type, value, maxUses, perUserLimit, usedCount = 0) {
    if (type === "percentage" && value > 100)
        throw new Error("درصد تخفیف نمی‌تواند بیش از ۱۰۰ باشد");
    if (maxUses < usedCount)
        throw new Error("محدودیت کل نمی‌تواند کمتر از تعداد استفاده‌شده باشد");
    if (perUserLimit > maxUses)
        throw new Error("محدودیت هر کاربر نمی‌تواند بیشتر از محدودیت کل باشد");
}
function normalizeCouponCode(code) {
    return normalizeCode(code);
}
function couponValue(coupon) {
    return coupon.value || coupon.discountPercent || 0;
}
class CouponService {
    static calculate(coupon, originalAmount) {
        if (!Number.isInteger(originalAmount) || originalAmount < 0)
            throw new Error("مبلغ سفارش معتبر نیست");
        const value = couponValue(coupon);
        const discountAmount = coupon.type === "fixed" ? Math.min(value, originalAmount) : Math.floor((originalAmount * value) / 100);
        return { originalAmount, discountAmount, finalAmount: Math.max(originalAmount - discountAmount, 0) };
    }
    static async create(code, discountPercent, expiresAt, maxUses = 10) {
        return this.createAdvanced({ code, type: "percentage", value: discountPercent, expiresAt, maxUses, perUserLimit: 1, minimumPurchaseAmount: 0 });
    }
    static async createAdvanced(data, actorId) {
        assertCoupon(data);
        assertCouponRules(data.type, data.value, data.maxUses, data.perUserLimit ?? 1);
        const type = data.type;
        const normalizedCode = normalizeCode(data.code);
        const coupon = await prisma_1.prisma.coupon.create({
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
        if (actorId)
            await prisma_1.prisma.auditLog.create({ data: { actorId, action: "coupon.create", metadata: JSON.stringify({ couponId: coupon.id, code: coupon.code }) } });
        return coupon;
    }
    static async update(couponId, data, actorId) {
        assertCoupon(data);
        const current = await prisma_1.prisma.coupon.findUniqueOrThrow({ where: { id: couponId } });
        if (current.status === "deleted")
            throw new Error("کوپن حذف‌شده قابل ویرایش نیست");
        const finalType = data.type ?? current.type;
        const finalValue = data.value ?? couponValue(current);
        const finalMaxUses = data.maxUses ?? current.maxUses;
        const finalPerUserLimit = data.perUserLimit ?? current.perUserLimit;
        assertCouponRules(finalType, finalValue, finalMaxUses, finalPerUserLimit, current.usedCount);
        const patch = {};
        if (data.code !== undefined)
            patch.code = normalizeCode(data.code);
        if (data.type !== undefined)
            patch.type = data.type;
        if (data.value !== undefined)
            patch.value = data.value;
        if (data.type !== undefined || data.value !== undefined)
            patch.discountPercent = finalType === "percentage" ? finalValue : null;
        if (data.maxUses !== undefined)
            patch.maxUses = data.maxUses;
        if (data.perUserLimit !== undefined)
            patch.perUserLimit = data.perUserLimit;
        if (data.minimumPurchaseAmount !== undefined)
            patch.minimumPurchaseAmount = data.minimumPurchaseAmount;
        if (data.expiresAt !== undefined)
            patch.expiresAt = data.expiresAt;
        if (data.status !== undefined)
            patch.status = data.status;
        const coupon = await prisma_1.prisma.coupon.update({ where: { id: couponId }, data: patch });
        await prisma_1.prisma.auditLog.create({ data: { actorId, action: "coupon.update", metadata: JSON.stringify({ couponId, fields: Object.keys(patch) }) } });
        return coupon;
    }
    static async setStatus(couponId, status, actorId) {
        const existing = await prisma_1.prisma.coupon.findUniqueOrThrow({ where: { id: couponId } });
        if (existing.status === "deleted")
            throw new Error("کوپن حذف‌شده را نمی‌توان فعال یا غیرفعال کرد");
        if (status === "active") {
            if (existing.expiresAt <= new Date())
                throw new Error("کوپن منقضی‌شده قابل فعال‌سازی نیست");
            if (existing.usedCount >= existing.maxUses)
                throw new Error("ظرفیت این کوپن تکمیل شده است");
        }
        const coupon = await prisma_1.prisma.coupon.update({ where: { id: couponId }, data: { status, deletedAt: null } });
        await prisma_1.prisma.auditLog.create({ data: { actorId, action: "coupon.status", metadata: JSON.stringify({ couponId, status }) } });
        return coupon;
    }
    static async softDelete(couponId, actorId) {
        const coupon = await prisma_1.prisma.coupon.update({ where: { id: couponId }, data: { status: "deleted", deletedAt: new Date() } });
        await prisma_1.prisma.auditLog.create({ data: { actorId, action: "coupon.delete.soft", metadata: JSON.stringify({ couponId }) } });
        return coupon;
    }
    static async hardDelete(couponId, actorId) {
        return prisma_1.prisma.$transaction(async (tx) => {
            await tx.couponUsage.deleteMany({ where: { couponId } });
            await tx.order.updateMany({ where: { couponId }, data: { couponId: null } });
            const coupon = await tx.coupon.delete({ where: { id: couponId } });
            await tx.auditLog.create({ data: { actorId, action: "coupon.delete.hard", metadata: JSON.stringify({ couponId }) } });
            return coupon;
        });
    }
    static async list(params = {}) {
        const page = Math.max(params.page ?? 1, 1);
        const take = params.take ?? 8;
        const where = {
            ...(params.status ? { status: params.status } : { status: { not: "deleted" } }),
            ...(params.query ? { code: { contains: normalizeCode(params.query) } } : {}),
        };
        return Promise.all([prisma_1.prisma.coupon.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * take, take }), prisma_1.prisma.coupon.count({ where })]);
    }
    static validateCouponShape(coupon, originalAmount, now = new Date()) {
        if (coupon.status === "deleted" || coupon.deletedAt)
            return "کد تخفیف پیدا نشد";
        if (coupon.status !== "active")
            return "کد تخفیف غیرفعال است";
        if (coupon.expiresAt <= now)
            return "کد تخفیف منقضی شده است";
        if (coupon.usedCount >= coupon.maxUses)
            return "ظرفیت استفاده از این کد به پایان رسیده است";
        if (originalAmount < coupon.minimumPurchaseAmount)
            return `حداقل مبلغ خرید برای این کد ${coupon.minimumPurchaseAmount.toLocaleString("fa-IR")} تومان است`;
        if (coupon.type !== "percentage" && coupon.type !== "fixed")
            return "نوع کد تخفیف معتبر نیست";
        const value = couponValue(coupon);
        if (!Number.isInteger(value) || value <= 0)
            return "مقدار تخفیف معتبر نیست";
        if (coupon.type === "percentage" && value > 100)
            return "درصد تخفیف معتبر نیست";
        return null;
    }
    static async validateForCheckout(data) {
        const tx = data.tx ?? prisma_1.prisma;
        const now = data.now ?? new Date();
        if (!Number.isInteger(data.originalAmount) || data.originalAmount < 0)
            return { ok: false, reason: "مبلغ سفارش معتبر نیست" };
        const normalizedCode = normalizeCode(data.code);
        if (!normalizedCode)
            return { ok: false, reason: "کد تخفیف وارد نشده است" };
        const coupon = await tx.coupon.findUnique({ where: { code: normalizedCode } });
        if (!coupon)
            return { ok: false, reason: "کد تخفیف پیدا نشد" };
        const shapeError = this.validateCouponShape(coupon, data.originalAmount, now);
        if (shapeError)
            return { ok: false, reason: shapeError };
        const usedByUser = await tx.couponUsage.count({ where: { couponId: coupon.id, userId: data.userId } });
        if (usedByUser >= coupon.perUserLimit)
            return { ok: false, reason: "❌ این کد قبلاً توسط شما استفاده شده است." };
        const calculation = this.calculate(coupon, data.originalAmount);
        if (calculation.finalAmount < 0)
            return { ok: false, reason: "مبلغ نهایی معتبر نیست" };
        return { ok: true, coupon, ...calculation };
    }
    static async validateForUser(code, userId, tx = prisma_1.prisma, originalAmount = 0) {
        const result = await this.validateForCheckout({ code, userId, originalAmount, tx });
        if (!result.ok)
            throw new Error(result.reason);
        return result.coupon;
    }
}
exports.CouponService = CouponService;
