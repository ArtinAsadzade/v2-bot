"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrderService = void 0;
const purchase_service_1 = require("../product/purchase.service");
class OrderService {
    static createPurchase(userId, productId, couponCode) {
        return purchase_service_1.PurchaseService.buyProduct(userId, productId, couponCode);
    }
}
exports.OrderService = OrderService;
