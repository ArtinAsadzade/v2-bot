import type { Prisma, PrismaClient } from '@prisma/client';

export type PrismaExecutor = PrismaClient | Prisma.TransactionClient;

export class ProvisioningRepository {
  public constructor(private readonly db: PrismaExecutor) {}

  public findActiveNode() {
    return this.db.xrayNode.findFirst({
      where: { isActive: true },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    });
  }

  public findProduct(productId: string) {
    return this.db.product.findFirst({
      where: { id: productId, status: 'ACTIVE', deletedAt: null },
      include: { node: true },
    });
  }

  public findDraft(draftId: string) {
    return this.db.purchaseDraft.findUnique({ where: { id: draftId }, include: { product: { include: { node: true } } } });
  }

  public findServiceByIdempotency(idempotencyKey: string) {
    return this.db.serviceInstance.findUnique({
      where: { idempotencyKey },
      include: { xrayClient: { include: { configLinkRows: true, subscriptionLinks: true } }, product: true },
    });
  }

  public findServiceForUser(serviceId: string, userId: string) {
    return this.db.serviceInstance.findFirst({
      where: { id: serviceId, userId, deletedAt: null },
      include: { xrayClient: { include: { configLinkRows: true, subscriptionLinks: true } }, product: true },
    });
  }

  public listUserServices(userId: string, limit = 20) {
    return this.db.serviceInstance.findMany({
      where: { userId, deletedAt: null, status: { not: 'DELETED' } },
      include: { product: true, xrayClient: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
