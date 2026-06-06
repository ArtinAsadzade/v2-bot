import { prisma } from "../services/prisma";

async function seed() {
  const category = await prisma.category.upsert({
    where: { name: "VIP" },
    update: {},
    create: { name: "VIP" },
  });

  const product = await prisma.product.create({
    data: {
      title: "VPN VIP",
      categoryId: category.id,
      price: 50000,
      duration: 30,
    },
  });

  await prisma.productAccount.createMany({
    data: [
      {
        productId: product.id,
        username: "vpn-user-1",
        subscriptionLink: "https://example.com/sub/vpn-user-1",
        configLink: "vless://config1",
        config: "vless://config1",
      },
      {
        productId: product.id,
        username: "vpn-user-2",
        subscriptionLink: "https://example.com/sub/vpn-user-2",
        configLink: "vless://config2",
        config: "vless://config2",
      },
    ],
  });

  await prisma.cryptoWallet.upsert({
    where: { coinName_networkName: { coinName: "USDT", networkName: "TRC20" } },
    update: {},
    create: { coinName: "USDT", networkName: "TRC20", walletAddress: "TRC20_WALLET_ADDRESS", rateToman: 92000 },
  });

  console.log("Seed done");
}

seed()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
