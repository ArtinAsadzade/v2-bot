import { PrismaClient, ProductCategory, ProductStatus, PricingStrategy } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const node = await prisma.xrayNode.upsert({
    where: { id: '00000000-0000-4000-8000-000000000001' },
    update: {
      baseUrl: process.env.XRAY_API_BASE_URL ?? 'https://xray.example.com',
      isActive: true,
    },
    create: {
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Default Panel',
      region: 'IR',
      baseUrl: process.env.XRAY_API_BASE_URL ?? 'https://xray.example.com',
      isActive: true,
      priority: 100,
    },
  });

  await prisma.product.upsert({
    where: { slug: 'premium-vless' },
    update: {
      nodeId: node.id,
      status: ProductStatus.ACTIVE,
    },
    create: {
      name: 'پریمیوم VLESS',
      slug: 'premium-vless',
      description: 'سرویس پریمیوم با پروتکل VLESS',
      inboundId: 1,
      protocol: 'vless',
      category: ProductCategory.PREMIUM,
      nodeId: node.id,
      priceToman: 500_000n,
      trafficGb: 50,
      durationDays: 30,
      pricingStrategy: PricingStrategy.FIXED,
      status: ProductStatus.ACTIVE,
    },
  });

  console.log('Seed completed (idempotent): default node + sample product');
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
