import { XrayApiError } from '../errors/xray-api.error.js';
import { createXrayHttpClient, type XrayHttpClient } from '../client/xray-http.client.js';
import { xrayLinksResponseSchema } from '../schemas/xray-api.schemas.js';

import type { ClientIdentity } from './client-identity.service.js';

export type ProvisionClientInput = {
  inboundId: number;
  identity: ClientIdentity;
  trafficGb: number;
  durationDays: number;
  baseUrl?: string;
  token?: string;
};

export type ProvisionedClient = {
  panelClientId: string;
  configLinks: string[];
  subscriptionLinks: string[];
  subscriptionUrl: string;
};

const gbToBytes = (gb: number): number => gb * 1024 * 1024 * 1024;

/** Creates clients in pre-configured inbounds only — never creates new inbounds. */
export class XrayProvisionService {
  public constructor(private readonly clientFactory = createXrayHttpClient) {}

  public async createClient(input: ProvisionClientInput): Promise<ProvisionedClient> {
    const client = this.clientFactory({ baseUrl: input.baseUrl, token: input.token });
    const expiryTime = Date.now() + input.durationDays * 86_400_000;
    const settings = JSON.stringify({
      clients: [
        {
          id: input.identity.clientUuid,
          email: input.identity.email,
          limitIp: 0,
          totalGB: gbToBytes(input.trafficGb),
          expiryTime,
          enable: true,
          tgId: input.identity.tags.telegramId ?? '',
          subId: input.identity.subscriptionId,
          flow: '',
          comment: `purchase:${input.identity.tags.purchaseId}`,
        },
      ],
    });
    await this.withRetry(() =>
      client.post('/panel/api/inbounds/addClient', { id: input.inboundId, settings }),
    );
    const configLinks = await this.fetchConfigLinks(client, input.inboundId, input.identity.email);
    const subscriptionLinks = await this.fetchSubLinks(client, input.identity.subscriptionId);
    const subscriptionUrl = subscriptionLinks[0] ?? '';
    if (!subscriptionUrl && configLinks.length === 0) {
      throw new XrayApiError('No config or subscription links returned from panel', 'XRAY_LINKS_EMPTY', {
        retryable: true,
      });
    }
    return {
      panelClientId: input.identity.clientUuid,
      configLinks,
      subscriptionLinks,
      subscriptionUrl,
    };
  }

  public async updateClient(input: {
    panelClientId: string;
    inboundId: number;
    identity: ClientIdentity;
    trafficGb: number;
    durationDays: number;
    enable?: boolean;
    baseUrl?: string;
    token?: string;
  }): Promise<void> {
    const client = this.clientFactory({ baseUrl: input.baseUrl, token: input.token });
    const expiryTime = Date.now() + input.durationDays * 86_400_000;
    const settings = JSON.stringify({
      clients: [
        {
          id: input.identity.clientUuid,
          email: input.identity.email,
          totalGB: gbToBytes(input.trafficGb),
          expiryTime,
          enable: input.enable ?? true,
          subId: input.identity.subscriptionId,
        },
      ],
    });
    await this.withRetry(() =>
      client.post(`/panel/api/inbounds/updateClient/${input.panelClientId}`, {
        id: input.inboundId,
        settings,
      }),
    );
  }

  public async deleteClient(input: {
    inboundId: number;
    panelClientId: string;
    baseUrl?: string;
    token?: string;
  }): Promise<void> {
    const client = this.clientFactory({ baseUrl: input.baseUrl, token: input.token });
    await this.withRetry(() =>
      client.post(`/panel/api/inbounds/${input.inboundId}/delClient/${input.panelClientId}`, {}),
    );
  }

  private async fetchConfigLinks(
    client: XrayHttpClient,
    inboundId: number,
    email: string,
  ): Promise<string[]> {
    const raw = await this.withRetry(() =>
      client.get(`/panel/api/inbounds/getClientLinks/${inboundId}/${encodeURIComponent(email)}`, xrayLinksResponseSchema),
    );
    return normalizeLinks(raw);
  }

  private async fetchSubLinks(client: XrayHttpClient, subId: string): Promise<string[]> {
    const raw = await this.withRetry(() =>
      client.get(`/panel/api/inbounds/getSubLinks/${subId}`, xrayLinksResponseSchema),
    );
    return normalizeLinks(raw);
  }

  private async withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
    let lastError: unknown;
    for (let i = 0; i < attempts; i += 1) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        const retryable = error instanceof XrayApiError && error.retryable;
        if (!retryable || i === attempts - 1) throw error;
        await new Promise((r) => setTimeout(r, 500 * 2 ** i));
      }
    }
    throw lastError;
  }
}

const normalizeLinks = (raw: string[] | unknown): string[] => {
  if (Array.isArray(raw)) return raw.filter((l) => typeof l === 'string' && l.length > 0);
  return [];
};
