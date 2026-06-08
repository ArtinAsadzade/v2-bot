import process from "node:process";
import { prisma } from "../src/services/prisma";

async function main() {
  const paidProductWithoutOrder = await prisma.paymentInvoice.findMany({
    where: { type: "PRODUCT_PURCHASE", status: "PAID", orderId: null },
    include: { user: true, product: true },
    orderBy: { updatedAt: "desc" },
  });

  const completedProductWithoutOrder = await prisma.paymentInvoice.findMany({
    where: { type: "PRODUCT_PURCHASE", status: "COMPLETED", orderId: null },
    include: { user: true, product: true },
    orderBy: { updatedAt: "desc" },
  });

  const failedInvoicesWithOrderItems = await prisma.paymentInvoice.findMany({
    where: { status: "FAILED", orderId: { not: null } },
    include: { user: true, order: { include: { items: true } } },
    orderBy: { updatedAt: "desc" },
  });

  const failedInvoicesWithWalletCredit = await prisma.paymentInvoice.findMany({
    where: { status: "FAILED", audits: { some: { action: { in: ["PAYMENT_WALLET_CREDITED", "WALLET_CREDITED"] } } } },
    include: { user: true, audits: { where: { action: { in: ["PAYMENT_WALLET_CREDITED", "WALLET_CREDITED"] } }, orderBy: { createdAt: "desc" } } },
    orderBy: { updatedAt: "desc" },
  });

  const failedInvoicesWithProductDelivery = await prisma.paymentInvoice.findMany({
    where: { status: "FAILED", OR: [{ deliveryStatus: "COMPLETED" }, { audits: { some: { action: { in: ["PAYMENT_PRODUCT_DELIVERED", "PRODUCT_DELIVERED"] } } } }] },
    include: { user: true, product: true, audits: { where: { action: { in: ["PAYMENT_PRODUCT_DELIVERED", "PRODUCT_DELIVERED"] } }, orderBy: { createdAt: "desc" } } },
    orderBy: { updatedAt: "desc" },
  });

  const report = {
    generatedAt: new Date().toISOString(),
    checks: {
      paidProductWithoutOrder: paidProductWithoutOrder.map((invoice) => ({ invoiceId: invoice.id, userId: invoice.userId, telegramId: invoice.user.telegramId, productId: invoice.productId, product: invoice.product?.title, amount: invoice.amount, paidAt: invoice.paidAt, callbackCount: invoice.callbackCount })),
      completedProductWithoutOrder: completedProductWithoutOrder.map((invoice) => ({ invoiceId: invoice.id, userId: invoice.userId, telegramId: invoice.user.telegramId, productId: invoice.productId, product: invoice.product?.title, amount: invoice.amount, completedAt: invoice.completedAt, callbackCount: invoice.callbackCount })),
      orderItemExistsButInvoiceFailed: failedInvoicesWithOrderItems.filter((invoice) => (invoice.order?.items.length ?? 0) > 0).map((invoice) => ({ invoiceId: invoice.id, userId: invoice.userId, telegramId: invoice.user.telegramId, orderId: invoice.orderId, orderItemCount: invoice.order?.items.length ?? 0, amount: invoice.amount, updatedAt: invoice.updatedAt })),
      walletCreditedButInvoiceFailed: failedInvoicesWithWalletCredit.map((invoice) => ({ invoiceId: invoice.id, userId: invoice.userId, telegramId: invoice.user.telegramId, amount: invoice.amount, creditAuditCount: invoice.audits.length, latestCreditAt: invoice.audits[0]?.createdAt })),
      productDeliveredButInvoiceFailed: failedInvoicesWithProductDelivery.map((invoice) => ({ invoiceId: invoice.id, userId: invoice.userId, telegramId: invoice.user.telegramId, productId: invoice.productId, product: invoice.product?.title, deliveryStatus: invoice.deliveryStatus, deliveryAuditCount: invoice.audits.length, updatedAt: invoice.updatedAt })),
    },
  };

  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
