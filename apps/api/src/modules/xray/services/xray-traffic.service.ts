import { createXrayHttpClient } from '../client/xray-http.client.js';
import { xrayClientTrafficSchema, type XrayClientTraffic } from '../schemas/xray-api.schemas.js';

export type TrafficSnapshot = {
  usedBytes: bigint;
  uploadBytes: bigint;
  downloadBytes: bigint;
  remainingBytes: bigint | null;
  expiresAt: Date | null;
  enabled: boolean;
};

export class XrayTrafficService {
  public constructor(private readonly clientFactory = createXrayHttpClient) {}

  public async fetchTraffic(
    email: string,
    trafficLimitGb: number,
    options?: { baseUrl?: string; token?: string },
  ): Promise<TrafficSnapshot> {
    const client = this.clientFactory(options);
    const raw = await client.get<XrayClientTraffic>(
      `/panel/api/inbounds/getClientTraffics/${encodeURIComponent(email)}`,
      xrayClientTrafficSchema,
    );
    const upload = BigInt(raw.up ?? 0);
    const download = BigInt(raw.down ?? 0);
    const used = BigInt(raw.total ?? 0) || upload + download;
    const limitBytes = BigInt(trafficLimitGb) * 1024n * 1024n * 1024n;
    const remaining = used < limitBytes ? limitBytes - used : 0n;
    return {
      usedBytes: used,
      uploadBytes: upload,
      downloadBytes: download,
      remainingBytes: remaining,
      expiresAt: raw.expiryTime ? new Date(raw.expiryTime) : null,
      enabled: raw.enable ?? true,
    };
  }
}
