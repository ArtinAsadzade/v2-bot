export class XrayApiError extends Error {
  public readonly code: string;
  public readonly statusCode?: number;
  public readonly retryable: boolean;
  public readonly details?: unknown;

  public constructor(
    message: string,
    code = 'XRAY_API_ERROR',
    options?: { statusCode?: number; retryable?: boolean; details?: unknown },
  ) {
    super(message);
    this.name = 'XrayApiError';
    this.code = code;
    this.statusCode = options?.statusCode;
    this.retryable = options?.retryable ?? false;
    this.details = options?.details;
  }
}

export const isRetryableXrayError = (error: unknown): boolean =>
  error instanceof XrayApiError && error.retryable;
