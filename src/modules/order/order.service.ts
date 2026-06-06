import { PurchaseService } from "../product/purchase.service";

export class OrderService {
  static createPurchase(userId: string, productId: string, couponCode?: string) {
    return PurchaseService.buyProduct(userId, productId, couponCode);
  }
}
