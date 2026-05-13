import { createHash, randomBytes } from 'node:crypto';

import type { PrismaClient } from '@prisma/client';
import type { TelegramUserSyncBody } from '../validators/telegram-user.validators.js';

export type TelegramUserView = {
  id: string;
  telegramId: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  languageCode: string | null;
  referralCode: string;
  referralCount: number;
  createdAt: string;
};

export class TelegramUserService {
  public constructor(private readonly prisma: PrismaClient) {}

  public async sync(input: TelegramUserSyncBody): Promise<TelegramUserView> {
    const existing = await this.prisma.user.findUnique({ where: { telegramId: input.telegramId }, select: { id: true } });
    const referrer = !existing && input.referralCode ? await this.findReferrer(input.referralCode, input.telegramId) : null;
    const user = await this.prisma.user.upsert({
      where: { telegramId: input.telegramId },
      update: {
        username: input.username ?? null,
        firstName: input.firstName ?? null,
        lastName: input.lastName ?? null,
        languageCode: input.languageCode ?? null,
      },
      create: {
        telegramId: input.telegramId,
        username: input.username ?? null,
        firstName: input.firstName ?? null,
        lastName: input.lastName ?? null,
        languageCode: input.languageCode ?? null,
        referralCode: await this.generateReferralCode(input.telegramId),
        referredById: referrer?.id,
        wallet: { create: { balanceToman: 0 } },
      },
      select: {
        id: true,
        telegramId: true,
        username: true,
        firstName: true,
        lastName: true,
        languageCode: true,
        referralCode: true,
        createdAt: true,
        referrals: { select: { id: true } },
      },
    });

    if (!existing && referrer) {
      await this.prisma.referral.upsert({
        where: { referrerId_refereeId: { referrerId: referrer.id, refereeId: user.id } },
        update: {},
        create: { referrerId: referrer.id, refereeId: user.id, metadata: { source: 'telegram_start' } },
      });
    }

    return {
      ...user,
      referralCount: user.referrals.length,
      createdAt: user.createdAt.toISOString(),
    };
  }

  private async findReferrer(referralCode: string, telegramId: string): Promise<{ id: string } | null> {
    const referrer = await this.prisma.user.findUnique({ where: { referralCode }, select: { id: true, telegramId: true } });
    if (!referrer || referrer.telegramId === telegramId) return null;
    return { id: referrer.id };
  }

  private async generateReferralCode(telegramId: string): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const digest = createHash('sha256').update(`${telegramId}:${randomBytes(8).toString('hex')}`).digest('base64url');
      const code = `V2${digest.slice(0, 10).toUpperCase()}`;
      const exists = await this.prisma.user.findUnique({ where: { referralCode: code }, select: { id: true } });
      if (!exists) return code;
    }
    throw new Error('Could not generate unique referral code');
  }
}
