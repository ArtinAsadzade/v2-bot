import { Redis } from 'ioredis';

import { config } from '../../config/index.js';

import type { ConnectionOptions } from 'bullmq';

export const createRedisConnection = (): Redis =>
  new Redis(config.redis.url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: true,
  });

export const createBullmqConnection = (): ConnectionOptions =>
  createRedisConnection() as ConnectionOptions;
