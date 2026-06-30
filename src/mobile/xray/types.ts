export type XrayProtocol = "vless" | "vmess" | "trojan" | "shadowsocks";
export type XrayTransport = "tcp" | "ws" | "grpc" | "http" | "quic" | "kcp";
export type XraySecurity = "none" | "tls" | "reality";
export type XrayConnectionState = "idle" | "starting" | "connected" | "stopping" | "stopped" | "restarting" | "error";

export type XrayStats = {
  uploadBytes: number;
  downloadBytes: number;
  startedAt?: number;
  updatedAt: number;
};

export type NormalizedXrayConfig = {
  id: string;
  protocol: XrayProtocol;
  remark?: string;
  server: string;
  port: number;
  userId?: string;
  password?: string;
  method?: string;
  alterId?: number;
  security?: XraySecurity;
  network?: XrayTransport;
  host?: string;
  path?: string;
  sni?: string;
  publicKey?: string;
  shortId?: string;
  fingerprint?: string;
  flow?: string;
  raw: string;
};

export type XrayStartOptions = {
  config: NormalizedXrayConfig;
  mtu?: number;
  bypassLan?: boolean;
  allowApps?: string[];
  disallowApps?: string[];
};

export type XrayPingResult = {
  ok: boolean;
  latencyMs?: number;
  error?: string;
};

export type NativeXrayModule = {
  start(options: XrayStartOptions): Promise<XrayConnectionState>;
  stop(): Promise<XrayConnectionState>;
  restart(options: XrayStartOptions): Promise<XrayConnectionState>;
  getState(): Promise<XrayConnectionState>;
  getStats(): Promise<XrayStats>;
  ping(config: NormalizedXrayConfig): Promise<XrayPingResult>;
  testTcpPing(config: NormalizedXrayConfig): Promise<XrayPingResult>;
  testRealDelay(config: NormalizedXrayConfig): Promise<XrayPingResult>;
};
