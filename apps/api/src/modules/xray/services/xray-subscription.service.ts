import { createXrayHttpClient } from '../client/xray-http.client.js';
import { xrayLinksResponseSchema } from '../schemas/xray-api.schemas.js';

export class XraySubscriptionService {
  public constructor(private readonly clientFactory = createXrayHttpClient) {}

  public async fetchConfigLinks(
    inboundId: number,
    email: string,
    options?: { baseUrl?: string; token?: string },
  ): Promise<string[]> {
    const client = this.clientFactory(options);
    const raw = await client.get(
      `/panel/api/inbounds/getClientLinks/${inboundId}/${encodeURIComponent(email)}`,
      xrayLinksResponseSchema,
    );
    return Array.isArray(raw) ? raw : [];
  }

  public async fetchSubscriptionLinks(
    subId: string,
    options?: { baseUrl?: string; token?: string },
  ): Promise<string[]> {
    const client = this.clientFactory(options);
    const raw = await client.get(`/panel/api/inbounds/getSubLinks/${subId}`, xrayLinksResponseSchema);
    return Array.isArray(raw) ? raw : [];
  }
}
