import axios, { type AxiosInstance } from 'axios';
import { env } from '../../config/env.js';
import type {
  AddClientRequest,
  XrayClientLinks,
  XrayPanelPort,
  XraySubscriptionLinks,
  XrayTrafficSnapshot,
} from '../../domain/ports/xray-panel.port.js';

const gbToBytes = (gb: number) => gb * 1024 * 1024 * 1024;

export class XrayPanelClient implements XrayPanelPort {
  private readonly http: AxiosInstance;

  constructor() {
    this.http = axios.create({
      baseURL: env.XRAY_BASE_URL,
      timeout: 15_000,
      headers: { Authorization: `Bearer ${env.XRAY_BEARER_TOKEN}` },
    });
  }

  async addClient(input: AddClientRequest): Promise<{ clientId: string }> {
    const clientId = crypto.randomUUID();
    await this.http.post('/panel/api/inbounds/addClient', {
      id: input.inboundId,
      settings: JSON.stringify({
        clients: [
          {
            id: clientId,
            email: input.email,
            totalGB: gbToBytes(input.trafficGb),
            expiryTime: Date.now() + input.expiryDays * 86_400_000,
            enable: true,
            subId: input.subId,
          },
        ],
      }),
    });
    return { clientId };
  }

  async getClientLinks(inboundId: number, email: string): Promise<XrayClientLinks> {
    const { data } = await this.http.get(`/panel/api/inbounds/getClientLinks/${inboundId}/${email}`);
    return { configLinks: Array.isArray(data.obj) ? data.obj : [] };
  }

  async getSubscriptionLinks(subId: string): Promise<XraySubscriptionLinks> {
    const { data } = await this.http.get(`/panel/api/inbounds/getSubLinks/${subId}`);
    return { subscriptionUrl: String(data.obj ?? '') };
  }

  async getClientTraffic(email: string): Promise<XrayTrafficSnapshot> {
    const { data } = await this.http.get(`/panel/api/inbounds/getClientTraffics/${email}`);
    const obj = data.obj ?? {};
    return {
      email,
      upBytes: Number(obj.up ?? 0),
      downBytes: Number(obj.down ?? 0),
      totalBytes: Number(obj.total ?? 0),
      expiryTime: Number(obj.expiryTime ?? 0),
    };
  }

  async updateClient(clientId: string, input: AddClientRequest): Promise<void> {
    await this.http.post(`/panel/api/inbounds/updateClient/${clientId}`, {
      id: input.inboundId,
      settings: JSON.stringify({
        clients: [{ id: clientId, email: input.email, totalGB: gbToBytes(input.trafficGb) }],
      }),
    });
  }

  async deleteClient(inboundId: number, clientId: string): Promise<void> {
    await this.http.post(`/panel/api/inbounds/${inboundId}/delClient/${clientId}`);
  }
}
