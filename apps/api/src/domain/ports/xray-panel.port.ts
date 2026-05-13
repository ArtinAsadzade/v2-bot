export interface AddClientRequest {
  inboundId: number;
  email: string;
  trafficGb: number;
  expiryDays: number;
  subId: string;
}

export interface XrayClientLinks {
  configLinks: string[];
}

export interface XraySubscriptionLinks {
  subscriptionUrl: string;
}

export interface XrayTrafficSnapshot {
  email: string;
  upBytes: number;
  downBytes: number;
  totalBytes: number;
  expiryTime: number;
}

export interface XrayPanelPort {
  addClient(input: AddClientRequest): Promise<{ clientId: string }>;
  getClientLinks(inboundId: number, email: string): Promise<XrayClientLinks>;
  getSubscriptionLinks(subId: string): Promise<XraySubscriptionLinks>;
  getClientTraffic(email: string): Promise<XrayTrafficSnapshot>;
  updateClient(clientId: string, input: AddClientRequest): Promise<void>;
  deleteClient(inboundId: number, clientId: string): Promise<void>;
}
