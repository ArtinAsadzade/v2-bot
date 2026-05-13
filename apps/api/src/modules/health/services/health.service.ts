import type { PrismaClient } from '@prisma/client';
import type Redis from 'ioredis';

export class HealthService {
  public constructor(
    private readonly prisma: PrismaClient,
    private readonly redis: Redis,
  ) {}

  public async check(): Promise<{ status: 'ok'; database: 'ok'; redis: 'ok'; timestamp: string }> {
    await this.prisma.$queryRaw`SELECT 1`;
    await this.redis.ping();
    return { status: 'ok', database: 'ok', redis: 'ok', timestamp: new Date().toISOString() };
  }
}
