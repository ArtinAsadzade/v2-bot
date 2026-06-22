const SENSITIVE_KEYS = [/token/i, /invoice(?:_id)?/i, /pay_id/i, /authority/i, /signature/i, /secret/i, /reference/i, /ref_id/i, /trans(?:action)?_?id/i];

function isSensitiveKey(key: string) {
  return SENSITIVE_KEYS.some((pattern) => pattern.test(key));
}

export function redactPaymentMetadata<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => redactPaymentMetadata(item)) as T;
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, isSensitiveKey(key) ? "[REDACTED]" : redactPaymentMetadata(item)]),
  ) as T;
}

export function safePaymentCallbackUrl(rawUrl?: string | null) {
  if (!rawUrl) return rawUrl;
  const [path] = rawUrl.split("?", 1);
  return rawUrl.includes("?") ? `${path}?[REDACTED]` : rawUrl;
}
