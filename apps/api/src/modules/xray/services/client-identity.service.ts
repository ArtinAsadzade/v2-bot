import { randomBytes, randomUUID } from 'node:crypto';

export type ClientIdentity = {
  clientUuid: string;
  email: string;
  subscriptionId: string;
  tags: Record<string, string>;
};

/** Deterministic, searchable client identity generation for panel provisioning. */
export class ClientIdentityService {
  public generate(input: {
    userId: string;
    productSlug: string;
    purchaseId: string;
    telegramId?: string;
  }): ClientIdentity {
    const shortPurchase = input.purchaseId.replace(/-/g, '').slice(0, 8);
    const shortUser = input.userId.replace(/-/g, '').slice(0, 6);
    const email = `u${shortUser}.${input.productSlug}.${shortPurchase}@v2bot.local`;
    const subscriptionId = randomBytes(8).toString('hex');
    return {
      clientUuid: randomUUID(),
      email,
      subscriptionId,
      tags: {
        userId: input.userId,
        purchaseId: input.purchaseId,
        productSlug: input.productSlug,
        ...(input.telegramId ? { telegramId: input.telegramId } : {}),
      },
    };
  }
}
