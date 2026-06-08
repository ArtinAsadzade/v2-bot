"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PurchaseService = void 0;
const prisma_1 = require("../../services/prisma");
const coupon_service_1 = require("../coupon/coupon.service");
const wallet_service_1 = require("../wallet/wallet.service");
const event_bus_service_1 = require("../../services/event-bus.service");
const admin_service_1 = require("../admin/admin.service");
const visibility_1 = require("./visibility");
class PurchaseService {
    static async buyProduct(userId, productId, couponCode) {
        return prisma_1.prisma.$transaction(async (tx) => {
            const product = await tx.product.findFirst({ where: { id: productId, AND: [(0, visibility_1.activeProductWhere)(), { category: { is: (0, visibility_1.activeCategoryWhere)() } }] } });
            if (!product)
                throw new Error("محصول پیدا نشد");
            let discountAmount = 0;
            let couponId = null;
            let couponMaxUses = 0;
            const originalAmount = product.price;
            let totalAmount = originalAmount;
            if (couponCode) {
                const coupon = await coupon_service_1.CouponService.validateForUser(couponCode, userId, tx, originalAmount);
                couponId = coupon.id;
                const calculation = coupon_service_1.CouponService.calculate(coupon, originalAmount);
                discountAmount = calculation.discountAmount;
                totalAmount = calculation.finalAmount;
                couponMaxUses = coupon.maxUses;
            }
            const account = await tx.productAccount.findFirst({
                where: { AND: [(0, visibility_1.availableInventoryWhere)(productId), (0, visibility_1.unassignedInventoryWhere)()] },
                orderBy: { createdAt: "asc" },
            });
            if (!account)
                throw new Error("موجودی این محصول تمام شده است");
            const reservedAt = new Date();
            const reserved = await tx.productAccount.updateMany({
                where: { id: account.id, AND: [(0, visibility_1.availableInventoryWhere)(productId), (0, visibility_1.unassignedInventoryWhere)()] },
                data: { status: "reserved", reservedBy: userId, reservedAt },
            });
            if (reserved.count !== 1)
                throw new Error("این اکانت هم‌اکنون رزرو شد؛ دوباره تلاش کنید");
            await tx.productAccountHistory.create({
                data: {
                    accountId: account.id,
                    actorId: userId,
                    action: "account.reserve",
                    fromValue: "available",
                    toValue: "reserved",
                    metadata: JSON.stringify({ productId, reservedAt }),
                },
            });
            if (totalAmount > 0) {
                await wallet_service_1.WalletService.debit(userId, totalAmount, `خرید محصول ${product.title}`, tx);
            }
            if (couponId) {
                const couponUpdated = await tx.coupon.updateMany({
                    where: { id: couponId, status: "active", usedCount: { lt: couponMaxUses }, expiresAt: { gt: new Date() } },
                    data: { usedCount: { increment: 1 } },
                });
                if (couponUpdated.count !== 1)
                    throw new Error("کد تخفیف دیگر قابل استفاده نیست");
            }
            const order = await tx.order.create({
                data: { userId, productId, couponId, originalAmount, totalAmount, finalPaidAmount: totalAmount, discountAmount, status: "completed" },
            });
            const purchaseDate = new Date();
            const durationDays = account.durationDays ?? product.duration;
            const expiresAt = new Date(purchaseDate.getTime() + durationDays * 86400000);
            const orderItem = await tx.orderItem.create({
                data: {
                    orderId: order.id,
                    productId,
                    productAccountId: account.id,
                    deliveredUsername: account.username,
                    deliveredPassword: account.password,
                    deliveredSubscriptionLink: account.subscriptionLink,
                    deliveredConfigLink: account.configLink,
                    deliveredConfig: account.configLink || account.config,
                    purchaseDate,
                    expiresAt,
                    isActive: true,
                },
            });
            if (couponId) {
                await tx.couponUsage.create({ data: { couponId, userId, orderId: order.id } });
            }
            const soldAt = new Date();
            const sold = await tx.productAccount.updateMany({
                where: { id: account.id, productId, status: "reserved", reservedBy: userId, AND: [(0, visibility_1.unassignedInventoryWhere)()] },
                data: { status: "sold", soldTo: userId, soldAt, reservedBy: null, reservedAt: null },
            });
            if (sold.count !== 1)
                throw new Error("تحویل اکانت ناموفق بود");
            await tx.productAccountHistory.create({
                data: {
                    accountId: account.id,
                    actorId: userId,
                    action: "account.deliver",
                    fromValue: "reserved",
                    toValue: "sold",
                    metadata: JSON.stringify({ orderId: order.id, orderItemId: orderItem.id, productId, soldAt, expiresAt }),
                },
            });
            const deliveredAccount = await tx.productAccount.findUniqueOrThrow({ where: { id: account.id } });
            return { order, product, account: deliveredAccount, totalAmount, originalAmount, discountAmount, couponId, couponCode, expiresAt };
        }).then((result) => {
            admin_service_1.AdminService.invalidateDashboardCache();
            event_bus_service_1.eventBus.emit("order.created", { orderId: result.order.id, userId, productId, totalAmount: result.totalAmount });
            event_bus_service_1.eventBus.emit("order.completed", { orderId: result.order.id, userId, productId, totalAmount: result.totalAmount });
            if (result.couponId && result.couponCode)
                event_bus_service_1.eventBus.emit("coupon.applied", { couponId: result.couponId, code: result.couponCode, userId, orderId: result.order.id, discountAmount: result.discountAmount });
            return result;
        });
    }
}
exports.PurchaseService = PurchaseService;
