import type { ApiFailure } from '@v2bot/shared';

export const toFailure = (code: string, message: string, requestId?: string, details?: unknown): ApiFailure => ({
  success: false,
  error: { code, message, ...(details ? { details } : {}) },
  ...(requestId ? { requestId } : {}),
});
