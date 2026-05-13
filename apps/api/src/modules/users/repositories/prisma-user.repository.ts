import type { PrismaClient } from '@prisma/client';

import type { UserReadModel, UserRepository } from './user.repository.js';

export class PrismaUserRepository implements UserRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async findByTelegramId(telegramId: string): Promise<UserReadModel | null> {
    return this.prisma.user.findUnique({
      where: { telegramId },
      select: { id: true, telegramId: true, username: true, status: true },
    });
  }
}
