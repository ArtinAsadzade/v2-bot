import { NormalizedXrayConfig, XrayProtocol, XraySecurity, XrayTransport } from "./types";
import { stableConfigId } from "./security";

function decodeBase64(input: string) {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(input.length / 4) * 4, "=");
  return Buffer.from(padded, "base64").toString("utf8");
}

function asPort(value: string | number | undefined) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid proxy port");
  return port;
}

function pickSecurity(value: string | null): XraySecurity {
  return value === "tls" || value === "reality" ? value : "none";
}

function pickNetwork(value: string | null): XrayTransport {
  return value === "ws" || value === "grpc" || value === "http" || value === "quic" || value === "kcp" ? value : "tcp";
}

function parseUrl(raw: string, protocol: Exclude<XrayProtocol, "vmess">): NormalizedXrayConfig {
  const url = new URL(raw);
  const params = url.searchParams;
  const credential = decodeURIComponent(url.username || "");
  const password = protocol === "vless" ? undefined : credential;
  return {
    id: stableConfigId(raw),
    protocol,
    remark: decodeURIComponent(url.hash.replace(/^#/, "")) || undefined,
    server: url.hostname,
    port: asPort(url.port),
    userId: protocol === "vless" ? credential : undefined,
    password,
    method: protocol === "shadowsocks" ? params.get("method") || undefined : undefined,
    security: pickSecurity(params.get("security")),
    network: pickNetwork(params.get("type") || params.get("network")),
    host: params.get("host") || undefined,
    path: params.get("path") || params.get("serviceName") || undefined,
    sni: params.get("sni") || params.get("peer") || undefined,
    publicKey: params.get("pbk") || undefined,
    shortId: params.get("sid") || undefined,
    fingerprint: params.get("fp") || undefined,
    flow: params.get("flow") || undefined,
    raw,
  };
}

function parseShadowsocks(raw: string): NormalizedXrayConfig {
  const stripped = raw.replace(/^ss:\/\//, "");
  const [bodyAndQuery, hash = ""] = stripped.split("#");
  const [body] = bodyAndQuery.split("?");
  const decoded = body.includes("@") ? body : decodeBase64(body);
  const [userinfo, hostPort] = decoded.split("@");
  const [method, password] = userinfo.includes(":") ? userinfo.split(":") : decodeBase64(userinfo).split(":");
  const lastColon = hostPort.lastIndexOf(":");
  return {
    id: stableConfigId(raw),
    protocol: "shadowsocks",
    remark: decodeURIComponent(hash) || undefined,
    server: hostPort.slice(0, lastColon),
    port: asPort(hostPort.slice(lastColon + 1)),
    method,
    password,
    security: "none",
    network: "tcp",
    raw,
  };
}

function parseVmess(raw: string): NormalizedXrayConfig {
  const json = JSON.parse(decodeBase64(raw.replace(/^vmess:\/\//, ""))) as Record<string, string | number | undefined>;
  return {
    id: stableConfigId(raw),
    protocol: "vmess",
    remark: String(json.ps || "") || undefined,
    server: String(json.add || ""),
    port: asPort(json.port),
    userId: String(json.id || ""),
    alterId: Number(json.aid || 0),
    security: pickSecurity(String(json.tls || "")),
    network: pickNetwork(String(json.net || "")),
    host: String(json.host || "") || undefined,
    path: String(json.path || "") || undefined,
    sni: String(json.sni || "") || undefined,
    raw,
  };
}

export function parseXrayUri(rawInput: string): NormalizedXrayConfig {
  const raw = rawInput.trim();
  if (raw.startsWith("vmess://")) return parseVmess(raw);
  if (raw.startsWith("vless://")) return parseUrl(raw, "vless");
  if (raw.startsWith("trojan://")) return parseUrl(raw, "trojan");
  if (raw.startsWith("ss://")) return parseShadowsocks(raw);
  throw new Error("Unsupported Xray URI scheme");
}

export function parseSubscription(input: string): NormalizedXrayConfig[] {
  const text = input.includes("://") ? input : decodeBase64(input.trim());
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map(parseXrayUri);
}
