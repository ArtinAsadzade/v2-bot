"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PurchaseService = void 0;
const payment_service_1 = require("../payment/payment.service");
class PurchaseService {
    static async buyProduct(userId, productId, couponCode) {
        return payment_service_1.PaymentService.purchaseProductWithWallet(userId, productId, couponCode);
    }
}
exports.PurchaseService = PurchaseService;
