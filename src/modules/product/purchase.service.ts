import { PaymentService } from "../payment/payment.service";

export class PurchaseService {
  static async buyProduct(userId: string, productId: string, couponCode?: string) {
    return PaymentService.purchaseProductWithWallet(userId, productId, couponCode);
  }
}
