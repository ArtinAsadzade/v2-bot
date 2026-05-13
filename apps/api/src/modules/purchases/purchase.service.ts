import type { PrismaClient } from '@prisma/client';
import type { XrayPanelPort } from '../../domain/ports/xray-panel.port.js';
import { WalletService } from '../wallet/wallet.service.js';

export class PurchaseService {
  private readonly wallet: WalletService;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly xray: XrayPanelPort,
  ) {
    this.wallet = new WalletService(prisma);
  }

  async buy(input: { userId: string; productId: string; trafficGb: number; idempotencyKey: string }) {
    const existing = await this.prisma.purchase.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (existing) return existing;

    const product = await this.prisma.product.findFirstOrThrow({
      where: { id: input.productId, status: 'ACTIVE' },
    });

    if (input.trafficGb < product.minTrafficGb || input.trafficGb > product.maxTrafficGb) {
      throw new Error('TRAFFIC_OUT_OF_RANGE');
    }

    const amountToman = product.pricePerGb * BigInt(input.trafficGb);
    await this.wallet.debitOrThrow({
      userId: input.userId,
      amountToman,
      reason: `Purchase ${product.name}`,
      idempotencyKey: `wallet:${input.idempotencyKey}`,
    });

    const email = `u-${input.userId.slice(0, 8)}-${Date.now()}`;
    const subId = crypto.randomUUID().replaceAll('-', '');
    const xrayClient = await this.xray.addClient({
      inboundId: product.inboundId,
      email,
      trafficGb: input.trafficGb,
      expiryDays: product.durationDays,
      subId,
    });
    const [links, sub] = await Promise.all([
      this.xray.getClientLinks(product.inboundId, email),
      this.xray.getSubscriptionLinks(subId),
    ]);

    return this.prisma.purchase.create({
      data: {
        userId: input.userId,
        productId: product.id,
        trafficGb: input.trafficGb,
        amountToman,
        idempotencyKey: input.idempotencyKey,
        xrayClient: {
          create: {
            userId: input.userId,
            productId: product.id,
            inboundId: product.inboundId,
            clientId: xrayClient.clientId,
            email,
            subId,
            configLinks: links.configLinks,
            subscriptionUrl: sub.subscriptionUrl,
            trafficGb: input.trafficGb,
            expiresAt: new Date(Date.now() + product.durationDays * 86_400_000),
          },
        },
      },
      include: { xrayClient: true, product: true },
    });
  }
}
