import { ProductStatus } from '@prisma/client';

import { NotFoundError } from '../../../core/errors/app-error.js';

import type { PrismaClient } from '@prisma/client';

export class ProductService {
  public constructor(private readonly prisma: PrismaClient) {}

  public async listActive() {
    return this.prisma.product.findMany({
      where: { status: ProductStatus.ACTIVE, deletedAt: null },
      include: { node: true },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
  }

  public async getById(productId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
      include: { node: true },
    });
    if (!product) throw new NotFoundError('Product');
    return product;
  }
}
