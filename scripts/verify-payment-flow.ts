import crypto from "crypto";
import { PaymentInvoiceService } from "../src/modules/payment/payment.service";
import { prisma } from "../src/services/prisma";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for safe dev payment-flow verification.");

const tag = `payment-flow-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };

async function createManualProductFixture(prefix: string, price: number, accountCount = 2) {
  const user = await prisma.user.create({ data: { telegramId: `${prefix}-${tag}`, username: prefix, balance: price * 3 } });
  const category = await prisma.category.create({ data: { name: `${prefix}-${tag}`, isActive: true } });
  const product = await prisma.product.create({ data: { categoryId: category.id, title: `${prefix} product ${tag}`, price, duration: 30, isActive: true } });
  const accounts = await Promise.all(Array.from({ length: accountCount }, (_, index) => prisma.productAccount.create({ data: { productId: product.id, username: `${prefix}-acct-${index}-${tag}`, subscriptionLink: `https://example.test/sub/${prefix}/${index}`, configLink: `https://example.test/config/${prefix}/${index}`, config: `vless://${prefix}-${index}`, durationDays: 30, status: "available" } })));
  return { user, category, product, accounts };
}

async function createPaidByCallbackInvoice(userId: string, amount: number, type: "PRODUCT_PURCHASE" | "WALLET_TOPUP", productId?: string) {
  return prisma.paymentInvoice.create({ data: { userId, amount, originalAmount: amount, discountAmount: 0, type, productId, status: "PENDING", callbackToken: crypto.randomBytes(32).toString("hex"), payId: `pay-${tag}-${type}-${crypto.randomBytes(3).toString("hex")}`, paymentLink: "https://example.test/pay" } });
}

async function verifyGatewayProductCallback() {
  const fixture = await createManualProductFixture("gateway-product", 50_000);
  const invoice = await createPaidByCallbackInvoice(fixture.user.id, fixture.product.price, "PRODUCT_PURCHASE", fixture.product.id);
  const first = await PaymentInvoiceService.processCallback({ invoice_id: invoice.id });
  assert(first.statusCode === 200, "product callback should succeed");
  assert(first.result && typeof first.result === "object" && "product" in first.result && "account" in first.result, "product callback result must contain product and account");
  const paid = await prisma.paymentInvoice.findUniqueOrThrow({ where: { id: invoice.id } });
  assert(paid.status === "COMPLETED", "product invoice should be completed");
  assert(Boolean(paid.orderId), "product invoice should link an order");
  const soldCount = await prisma.productAccount.count({ where: { productId: fixture.product.id, status: "sold", soldTo: fixture.user.id } });
  const second = await PaymentInvoiceService.processCallback({ invoice_id: invoice.id });
  const soldCountAfterSecond = await prisma.productAccount.count({ where: { productId: fixture.product.id, status: "sold", soldTo: fixture.user.id } });
  const orderCount = await prisma.order.count({ where: { userId: fixture.user.id, productId: fixture.product.id } });
  assert(second.statusCode === 200 && second.result, "duplicate product callback should return existing result");
  assert(soldCount === 1 && soldCountAfterSecond === 1, "duplicate product callback must not sell another account");
  assert(orderCount === 1, "duplicate product callback must not create duplicate orders");
}

async function verifyGatewayWalletTopupCallback() {
  const user = await prisma.user.create({ data: { telegramId: `gateway-wallet-${tag}`, username: "gateway-wallet", balance: 10_000 } });
  const invoice = await createPaidByCallbackInvoice(user.id, 75_000, "WALLET_TOPUP");
  const first = await PaymentInvoiceService.processCallback({ invoice_id: invoice.id });
  assert(first.statusCode === 200, "wallet callback should succeed");
  assert(first.result && typeof first.result === "object" && (first.result as any).type === "WALLET_TOPUP", "wallet callback result must be WALLET_TOPUP");
  const afterFirst = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  const txCount = await prisma.walletTransaction.count({ where: { userId: user.id, description: { contains: invoice.id } } });
  await PaymentInvoiceService.processCallback({ invoice_id: invoice.id });
  const afterSecond = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  const txCountAfterSecond = await prisma.walletTransaction.count({ where: { userId: user.id, description: { contains: invoice.id } } });
  assert(afterFirst.balance === user.balance + invoice.amount && afterSecond.balance === afterFirst.balance, "duplicate wallet callback must credit exactly once");
  assert(txCount === 1 && txCountAfterSecond === 1, "duplicate wallet callback must not create duplicate wallet transactions");
}

async function verifyWalletBalancePurchase() {
  const fixture = await createManualProductFixture("wallet-purchase", 40_000);
  const before = await prisma.user.findUniqueOrThrow({ where: { id: fixture.user.id } });
  const result = await PaymentInvoiceService.purchaseProductWithWallet(fixture.user.id, fixture.product.id);
  assert(result.product.id === fixture.product.id && result.account, "wallet purchase must deliver product/account");
  const after = await prisma.user.findUniqueOrThrow({ where: { id: fixture.user.id } });
  const soldCount = await prisma.productAccount.count({ where: { productId: fixture.product.id, status: "sold", soldTo: fixture.user.id } });
  const orderCount = await prisma.order.count({ where: { userId: fixture.user.id, productId: fixture.product.id } });
  assert(after.balance === before.balance - fixture.product.price, "wallet purchase must deduct once");
  assert(soldCount === 1 && orderCount === 1, "wallet purchase must create one delivery/order");
}

async function main() {
  await verifyGatewayProductCallback();
  await verifyGatewayWalletTopupCallback();
  await verifyWalletBalancePurchase();
  console.log("✅ payment flow verification passed", { tag });
}

main().finally(async () => prisma.$disconnect());
