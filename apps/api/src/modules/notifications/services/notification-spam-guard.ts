import { config } from '../../../config/index.js';

import type Redis from 'ioredis';

export class NotificationSpamGuard {
  public constructor(private readonly redis: Redis) {}

  public async canSend(userId: string, deduplicationKey: string): Promise<boolean> {
    const cooldownKey = `notify:cooldown:${userId}`;
    const dedupKey = `notify:dedup:${deduplicationKey}`;
    const [cooldown, dedup] = await Promise.all([
      this.redis.get(cooldownKey),
      this.redis.get(dedupKey),
    ]);
    if (cooldown || dedup) return false;
    return true;
  }

  public async markSent(userId: string, deduplicationKey: string): Promise<void> {
    const ttl = config.engagement.notificationCooldownSeconds;
    await Promise.all([
      this.redis.set(`notify:cooldown:${userId}`, '1', 'EX', ttl),
      this.redis.set(`notify:dedup:${deduplicationKey}`, '1', 'EX', ttl * 24),
    ]);
  }
}
