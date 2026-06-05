import type { Env } from './env.js';

export const createXrayConfig = (env: Env) =>
  ({
    baseUrl: env.XRAY_API_BASE_URL,
    token: env.XRAY_API_TOKEN,
    timeoutMs: env.XRAY_API_TIMEOUT_MS,
    mock: env.XRAY_API_MOCK,
    rateLimitPerSec: env.XRAY_RATE_LIMIT_PER_SEC,
  }) as const;
