import type { Env } from './env.js';

export const createJwtConfig = (env: Env) => ({ accessSecret: env.JWT_ACCESS_SECRET, refreshSecret: env.JWT_REFRESH_SECRET, accessTtl: env.JWT_ACCESS_TTL, refreshTtl: env.JWT_REFRESH_TTL }) as const;
