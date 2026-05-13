import { CouponStatus, PricingRuleStatus, PurchaseDraftStatus } from '@prisma/client';

import { AppError } from '../../../core/errors/app-error.js';
import { FinanceRepository } from '../repositories/finance.repository.js';
import { minToman, multiplyByBps, subtractToman } from './money.js';

import type { PrismaClient } from '@prisma/client';

const DEFAULT_PRICE_PER_GB_TOMAN = 100_000n;

export class PricingService {
  public constructor(private readonly prisma: PrismaClient) {}

  public async calculate(input: {
    trafficGb: number;
    couponCode?: string | undefined;
    region?: string | undefined;
    userSegment?: string | undefined;
  }) {
    const now = new Date();
    const rule = await this.prisma.pricingRule.findFirst({
      where: {
        status: PricingRuleStatus.ACTIVE,
        OR: [{ region: input.region ?? null }, { region: null }],
        AND: [
          { OR: [{ userSegment: input.userSegment ?? null }, { userSegment: null }] },
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
        ],
      },
      orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
    });
    const pricePerGb = rule?.pricePerGbToman ?? DEFAULT_PRICE_PER_GB_TOMAN;
    const baseAmount = pricePerGb * BigInt(input.trafficGb);
    let discount = 0n;
    let coupon = null;
    if (input.couponCode) {
      coupon = await this.prisma.coupon.findUnique({
        where: { code: input.couponCode.toUpperCase() },
      });
      const valid =
        coupon &&
        coupon.status === CouponStatus.ACTIVE &&
        (!coupon.expiresAt || coupon.expiresAt > now) &&
        (!coupon.startsAt || coupon.startsAt <= now) &&
        (!coupon.maxRedemptions || coupon.redeemedCount < coupon.maxRedemptions);
      if (!valid || !coupon) throw new AppError('Coupon is not valid', 'INVALID_COUPON', 400);
      const bpsDiscount = coupon.discountBps ? multiplyByBps(baseAmount, coupon.discountBps) : 0n;
      const fixedDiscount = coupon.discountAmountToman ?? 0n;
      discount = minToman(baseAmount, bpsDiscount + fixedDiscount);
    }
    return {
      trafficGb: input.trafficGb,
      pricePerGbToman: pricePerGb,
      baseAmountToman: baseAmount,
      discountToman: discount,
      finalAmountToman: subtractToman(baseAmount, discount),
      pricingRuleId: rule?.id,
      couponCode: coupon?.code,
    };
  }

  public async createPurchaseDraft(input: {
    userId: string;
    trafficGb: number;
    couponCode?: string | undefined;
    region?: string | undefined;
    userSegment?: string | undefined;
    reserveFunds: boolean;
    idempotencyKey: string;
  }) {
    const existing = await this.prisma.purchaseDraft.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) return existing;
    const quote = await this.calculate(input);
    const expiresAt = new Date(Date.now() + 15 * 60_000);
    return this.prisma.$transaction(async (tx) => {
      const repository = new FinanceRepository(tx);
      await repository.upsertWallet(input.userId);
      const wallet = await repository.lockWallet(input.userId);
      if (!wallet) throw new AppError('Wallet unavailable', 'WALLET_UNAVAILABLE', 409);
      const available = wallet.balance_toman - wallet.frozen_balance_toman;
      if (available < quote.finalAmountToman)
        throw new AppError('Insufficient wallet balance', 'INSUFFICIENT_BALANCE', 409);
      if (input.reserveFunds)
        await tx.wallet.update({
          where: { id: wallet.id },
          data: {
            frozenBalanceToman: { increment: quote.finalAmountToman },
            version: { increment: 1 },
          },
        });
      const draft = await tx.purchaseDraft.create({
        data: {
          userId: input.userId,
          status: input.reserveFunds
            ? PurchaseDraftStatus.FUNDS_RESERVED
            : PurchaseDraftStatus.DRAFT,
          trafficGb: input.trafficGb,
          baseAmountToman: quote.baseAmountToman,
          discountToman: quote.discountToman,
          finalAmountToman: quote.finalAmountToman,
          reservedToman: input.reserveFunds ? quote.finalAmountToman : 0n,
          pricingRuleId: quote.pricingRuleId,
          couponCode: quote.couponCode,
          idempotencyKey: input.idempotencyKey,
          expiresAt,
          metadata: { pricePerGbToman: quote.pricePerGbToman.toString() },
        } as never,
      });
      await tx.financialAuditLog.create({
        data: {
          action: 'PURCHASE_DRAFT_CREATED',
          actorType: 'USER',
          actorUserId: input.userId,
          userId: input.userId,
          walletId: wallet.id,
          referenceId: draft.id,
          metadata: { reserveFunds: input.reserveFunds },
        },
      });
      return draft;
    });
  }
}
