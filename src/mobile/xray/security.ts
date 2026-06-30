import { NormalizedXrayConfig } from "./types";

const SECRET_KEYS = ["userId", "password", "raw", "publicKey", "shortId"] as const;

function maskSecret(value?: string) {
  if (!value) return value;
  if (value.length <= 8) return "****";
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

export function maskConfig(config: NormalizedXrayConfig): Omit<NormalizedXrayConfig, "raw"> & { raw: string } {
  const masked = { ...config, raw: "[redacted]" };
  for (const key of SECRET_KEYS) {
    if (key in masked) {
      const record = masked as unknown as Record<string, string | undefined>;
      record[key] = maskSecret(record[key]);
    }
  }
  return masked;
}

export function stableConfigId(raw: string) {
  let hash = 2166136261;
  for (let i = 0; i < raw.length; i += 1) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `cfg_${(hash >>> 0).toString(16)}`;
}
