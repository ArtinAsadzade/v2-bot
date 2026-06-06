"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_1 = require("../services/prisma");
async function seed() {
    const category = await prisma_1.prisma.category.upsert({
        where: { name: "VIP" },
        update: {},
        create: { name: "VIP" },
    });
    const product = await prisma_1.prisma.product.create({
        data: {
            title: "VPN VIP",
            categoryId: category.id,
            price: 50000,
            duration: 30,
        },
    });
    await prisma_1.prisma.productAccount.createMany({
        data: [
            {
                productId: product.id,
                username: "vpn-user-1",
                password: "change-me-1",
                config: "vless://config1",
            },
            {
                productId: product.id,
                username: "vpn-user-2",
                password: "change-me-2",
                config: "vless://config2",
            },
        ],
    });
    console.log("Seed done");
}
seed()
    .catch((error) => {
    console.error(error);
    process.exit(1);
})
    .finally(async () => {
    await prisma_1.prisma.$disconnect();
});
