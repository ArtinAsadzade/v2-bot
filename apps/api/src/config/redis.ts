import type { Env } from './env.js';

export const createRedisConfig = (env: Env) => ({ url: env.REDIS_URL }) as const;
