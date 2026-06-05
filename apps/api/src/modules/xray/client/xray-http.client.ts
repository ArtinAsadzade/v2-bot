import axios, { type AxiosError, type AxiosInstance } from 'axios';

import { config } from '../../../config/index.js';
import { logger } from '../../../core/logger/logger.js';
import { XrayApiError } from '../errors/xray-api.error.js';
import { xrayApiEnvelopeSchema } from '../schemas/xray-api.schemas.js';

import type { z } from 'zod';

type RequestOptions = { baseUrl?: string; token?: string };

/** Centralized 3x-ui panel HTTP client with retry, timeout, rate limiting, and normalized errors. */
export class XrayHttpClient {
  private readonly axios: AxiosInstance;
  private lastRequestAt = 0;
  private readonly minIntervalMs: number;

  public constructor(private readonly options: RequestOptions = {}) {
    this.minIntervalMs = Math.ceil(1000 / config.xray.rateLimitPerSec);
    this.axios = axios.create({
      baseURL: options.baseUrl ?? config.xray.baseUrl,
      timeout: config.xray.timeoutMs,
      headers: {
        Authorization: `Bearer ${options.token ?? config.xray.token}`,
        'Content-Type': 'application/json',
      },
    });
  }

  public async post<T>(path: string, body: unknown, schema?: z.ZodType<T>): Promise<T> {
    return this.request('POST', path, body, schema);
  }

  public async get<T>(path: string, schema?: z.ZodType<T>): Promise<T> {
    return this.request('GET', path, undefined, schema);
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
    schema?: z.ZodType<T>,
  ): Promise<T> {
    await this.throttle();
    const started = Date.now();
    try {
      const response = await this.axios.request({
        method,
        url: path,
        data: body,
      });
      const latencyMs = Date.now() - started;
      logger.debug({ path, method, latencyMs, status: response.status }, 'xray api request completed');
      const envelope = xrayApiEnvelopeSchema.safeParse(response.data);
      if (envelope.success && envelope.data.success === false) {
        throw new XrayApiError(envelope.data.msg ?? 'Xray panel rejected request', 'XRAY_PANEL_ERROR', {
          statusCode: response.status,
          retryable: false,
          details: envelope.data,
        });
      }
      const payload = envelope.success && envelope.data.obj !== undefined ? envelope.data.obj : response.data;
      if (!schema) return payload as T;
      const parsed = schema.safeParse(payload);
      if (!parsed.success) {
        throw new XrayApiError('Invalid Xray API response shape', 'XRAY_RESPONSE_INVALID', {
          details: parsed.error.flatten(),
        });
      }
      return parsed.data;
    } catch (error) {
      throw this.normalizeError(error, path, method);
    }
  }

  private async throttle(): Promise<void> {
    const elapsed = Date.now() - this.lastRequestAt;
    if (elapsed < this.minIntervalMs) {
      await new Promise((resolve) => setTimeout(resolve, this.minIntervalMs - elapsed));
    }
    this.lastRequestAt = Date.now();
  }

  private normalizeError(error: unknown, path: string, method: string): XrayApiError {
    if (error instanceof XrayApiError) return error;
    const axiosError = error as AxiosError;
    const status = axiosError.response?.status;
    const retryable = !status || status >= 500 || status === 429;
    logger.warn(
      { path, method, status, message: axiosError.message },
      'xray api request failed',
    );
    return new XrayApiError(axiosError.message || 'Xray API request failed', 'XRAY_HTTP_ERROR', {
      ...(status !== undefined ? { statusCode: status } : {}),
      retryable,
      details: axiosError.response?.data,
    });
  }
}

export const createXrayHttpClient = (options?: RequestOptions): XrayHttpClient =>
  config.xray.mock ? new XrayMockHttpClient(options) : new XrayHttpClient(options);

/** In-memory mock for local dev and automated simulations. */
class XrayMockHttpClient extends XrayHttpClient {
  private readonly clients = new Map<string, { inboundId: number; email: string; subId: string }>();

  public override async post<T>(path: string, body: unknown): Promise<T> {
    if (path === '/panel/api/inbounds/addClient') {
      const payload = body as { id: number; settings: string };
      const settings = JSON.parse(payload.settings) as { clients: Array<{ id: string; email: string; subId: string }> };
      const client = settings.clients[0]!;
      this.clients.set(client.email, { inboundId: payload.id, email: client.email, subId: client.subId });
      return { success: true } as T;
    }
    if (path.startsWith('/panel/api/inbounds/updateClient/')) return { success: true } as T;
    if (path.includes('/delClient/')) return { success: true } as T;
    return { success: true } as T;
  }

  public override async get<T>(path: string): Promise<T> {
    if (path.includes('/getClientLinks/')) {
      const [, , email] = path.split('/');
      return [`vless://mock-${email}@panel.local:443`] as T;
    }
    if (path.includes('/getSubLinks/')) {
      const subId = path.split('/').pop()!;
      return [`https://panel.local/sub/${subId}`] as T;
    }
    if (path.includes('/getClientTraffics/')) {
      const email = decodeURIComponent(path.split('/').pop()!);
      return { up: 0, down: 0, total: 0, enable: true, expiryTime: Date.now() + 86_400_000 } as T;
    }
    return {} as T;
  }
}
