import type { PrismaClient, User } from '@prisma/client';

const referralCode = (telegramId: string) => `V2${telegramId.slice(-6)}${crypto.randomUUID().slice(0, 4)}`.toUpperCase();

export class UserService {
  constructor(private readonly prisma: PrismaClient) {}

  async ensureTelegramUser(input: {
    telegramId: string;
    username?: string;
    firstName?: string;
    lastName?: string;
    refCode?: string;
  }): Promise<User> {
    const existing = await this.prisma.user.findUnique({ where: { telegramId: input.telegramId } });
    if (existing) return existing;

    const referrer = input.refCode
      ? await this.prisma.user.findUnique({ where: { referralCode: input.refCode } })
      : null;

    return this.prisma.user.create({
      data: {
        telegramId: input.telegramId,
        username: input.username,
        firstName: input.firstName,
        lastName: input.lastName,
        referralCode: referralCode(input.telegramId),
        referredById: referrer?.id,
        wallet: { create: {} },
      },
    });
  }
}
