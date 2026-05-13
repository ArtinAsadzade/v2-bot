export type ApiSuccess<T> = {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
};

export type ApiFailure = {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  requestId?: string;
};

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export const ok = <T>(data: T, meta?: Record<string, unknown>): ApiSuccess<T> => ({
  success: true,
  data,
  ...(meta ? { meta } : {}),
});
