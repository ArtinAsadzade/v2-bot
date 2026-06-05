import { prisma } from "../services/prisma";

async function seed() {
  const product = await prisma.product.create({
    data: {
      title: "VPN VIP",
      category: "VIP",
      price: 50000,
      duration: 30,
    },
  });

  await prisma.productItem.createMany({
    data: [
      {
        productId: product.id,
        configLink: "vless://config1",
      },
      {
        productId: product.id,
        configLink: "vless://config2",
      },
    ],
  });

  console.log("Seed done");
}

seed();
