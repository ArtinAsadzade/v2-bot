import { AdminService } from "../admin/admin.service";
import { eventBus } from "../../services/event-bus.service";
import { MonitoringService } from "../../services/monitoring.service";
import { paymentLog } from "./payment-logging";
import type { PurchaseMethod } from "./payment.types";

type WalletPaymentDeps = {
  finalizePaidProductPurchase(data: { userId: string; productId: string; paymentSource: PurchaseMethod; couponCode?: string | null }): Promise<any>;
};

export class WalletPaymentService {
  static async purchaseProductWithWallet(userId: string, productId: string, couponCode: string | undefined, deps: WalletPaymentDeps) {
    let result;
    try {
      result = await deps.finalizePaidProductPurchase({ userId, productId, couponCode, paymentSource: "WALLET" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/کد تخفیف|کوپن|تخفیف/.test(message)) {
        paymentLog("COUPON_RECHECK_FAILED", { userId, productId, couponCode, reason: message, severity: "warning" });
      } else {
        MonitoringService.record({
          type: "PURCHASE_FAILED",
          section: "Purchase Flow",
          description: message,
          userId,
          severity: "critical",
          suggestedAction: "موجودی، کیف پول و وضعیت محصول را بررسی کنید.",
          metadata: { productId, couponCode },
        });
      }
      throw error;
    }
    AdminService.invalidateDashboardCache();
    eventBus.emit("order.created", { orderId: result.order.id, userId, productId, totalAmount: result.totalAmount });
    eventBus.emit("order.completed", { orderId: result.order.id, userId, productId, totalAmount: result.totalAmount });
    if (result.couponId && result.couponCode)
      eventBus.emit("coupon.applied", {
        couponId: result.couponId,
        code: result.couponCode,
        userId,
        orderId: result.order.id,
        discountAmount: result.discountAmount,
      });
    return result;
  }
}
