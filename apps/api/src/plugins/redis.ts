import fp from 'fastify-plugin';
import type { Redis } from 'ioredis';

import { createRedisConnection } from '../infrastructure/redis/client.js';

declare module 'fastify' {
  interface FastifyInstance {
    redis: Redis;
  }
}

export const redisPlugin = fp(async (app) => {
  const redis = createRedisConnection();
  await redis.connect();
  app.decorate('redis', redis);
  app.addHook('onClose', async () => {
    await redis.quit();
  });
});
