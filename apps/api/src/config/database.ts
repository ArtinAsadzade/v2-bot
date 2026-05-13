import type { Env } from './env.js';

export const createDatabaseConfig = (env: Env) => ({ url: env.DATABASE_URL }) as const;
