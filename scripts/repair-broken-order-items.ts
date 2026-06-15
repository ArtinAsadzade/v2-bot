import { prisma } from "../src/services/prisma";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log(JSON.stringify({ brokenCount: null, repaired: 0, markedLegacy: 0, skipped: "DATABASE_URL is not set" }, null, 2));
    return;
  }
  const brokenManualItems = await prisma.orderItem.findMany({
    where: { xrayClientId: null, OR: [{ productAccountId: null }, { productAccount: { is: null } }] },
    include: { order: true, product: true },
  });
  let repaired = 0;
  let markedLegacy = 0;
  for (const item of brokenManualItems) {
    const account = await prisma.productAccount.findFirst({
      where: { productId: item.productId, soldTo: item.order.userId, username: item.deliveredUsername },
      orderBy: { soldAt: "desc" },
    });
    if (account) {
      await prisma.orderItem.update({ where: { id: item.id }, data: { productAccountId: account.id } });
      repaired += 1;
    } else {
      await prisma.orderItem.update({ where: { id: item.id }, data: { isActive: false, legacyStatus: "broken_product_account" } as any });
      markedLegacy += 1;
    }
  }
  console.log(JSON.stringify({ brokenCount: brokenManualItems.length, repaired, markedLegacy }, null, 2));
}

main().finally(() => prisma.$disconnect());
