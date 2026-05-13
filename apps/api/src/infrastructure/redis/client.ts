import Redis from 'ioredis';

import { config } from '../../config/index.js';

export const createRedisConnection = (): Redis =>
  new Redis(config.redis.url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: true,
  });
