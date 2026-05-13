import type { PrismaClient, Product } from '@prisma/client';

export class ProductService {
  constructor(private readonly prisma: PrismaClient) {}

  listActive(): Promise<Product[]> {
    return this.prisma.product.findMany({ where: { status: 'ACTIVE' }, orderBy: { pricePerGb: 'asc' } });
  }

  getActive(productId: string): Promise<Product> {
    return this.prisma.product.findFirstOrThrow({ where: { id: productId, status: 'ACTIVE' } });
  }
}
