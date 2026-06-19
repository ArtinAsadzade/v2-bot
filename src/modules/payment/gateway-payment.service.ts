const CALLBACK_TOKEN_PARAM = "token";
const CALLBACK_INVOICE_PARAM = "invoice_id";

export class GatewayHttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export class GatewayConnectionError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export class DuplicateGatewayPayIdError extends Error {
  constructor(
    public readonly payId: string,
    public readonly existingInvoiceId: string,
  ) {
    super("شناسه پرداخت تکراری از درگاه دریافت شد");
  }
}

export function normalizeBaseUrl(url: string) {
  return url.trim().replace(/\/+$/, "");
}

function localGatewayUrlsAllowed() {
  return process.env.PAYMENT_GATEWAY_ALLOW_LOCAL_URLS === "true";
}

function isLocalHostname(hostname: string) {
  const normalized = hostname.toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1" || normalized.endsWith(".localhost");
}

export function assertValidHttpUrl(value: string, label: string, options: { normalizeBase?: boolean } = {}) {
  const raw = value.trim();
  if (!raw) throw new Error(`${label} الزامی است`);
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`${label} معتبر نیست`);
  }
  if (!/^https?:$/.test(parsed.protocol)) throw new Error(`${label} معتبر نیست`);
  if (!parsed.hostname || parsed.hostname.length < 3) throw new Error(`${label} معتبر نیست`);
  if (isLocalHostname(parsed.hostname) && !localGatewayUrlsAllowed()) throw new Error(`${label} localhost مجاز نیست`);
  if (!localGatewayUrlsAllowed() && !parsed.hostname.includes(".") && !/^\d+\.\d+\.\d+\.\d+$/.test(parsed.hostname))
    throw new Error(`${label} معتبر نیست`);
  return options.normalizeBase ? normalizeBaseUrl(parsed.toString()) : parsed.toString();
}

export function validateUrl(value: string, label: string) {
  assertValidHttpUrl(value, label);
}

export function parseGatewayResponse(body: unknown) {
  if (!body || typeof body !== "object") throw new Error("پاسخ درگاه معتبر نیست");
  const data = body as Record<string, unknown>;
  if (String(data.status ?? "").toLowerCase() !== "true") throw new Error(String(data.message ?? "درگاه ایجاد فاکتور را تأیید نکرد"));
  const payId = String(data.pay_id ?? "").trim();
  const paymentLink = String(data.payment_link ?? "").trim();
  if (!payId || !paymentLink) throw new Error("شناسه یا لینک پرداخت از درگاه دریافت نشد");
  validateUrl(paymentLink, "لینک پرداخت");
  return { payId, paymentLink };
}

export function invoiceCallbackUrl(baseCallbackUrl: string, data: { invoiceId: string; callbackToken: string }) {
  const withId = baseCallbackUrl.includes("{invoiceId}")
    ? baseCallbackUrl.split("{invoiceId}").join(encodeURIComponent(data.invoiceId))
    : baseCallbackUrl;
  const withToken = withId.includes("{token}") ? withId.split("{token}").join(encodeURIComponent(data.callbackToken)) : withId;
  const url = new URL(withToken);
  url.searchParams.set(CALLBACK_INVOICE_PARAM, data.invoiceId);
  url.searchParams.set(CALLBACK_TOKEN_PARAM, data.callbackToken);
  return url.toString();
}

export function safeJson(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({ error: "unserializable" });
  }
}

export async function requestGatewayInvoice(gateway: { apiBaseUrl: string; apiKey: string }, price: number, callbackUrl: string) {
  const payload = { price, callback_url: callbackUrl };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  let response: Response;
  try {
    response = await fetch(`${normalizeBaseUrl(gateway.apiBaseUrl)}/invoice/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-KEY": gateway.apiKey },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (error) {
    throw new GatewayConnectionError(
      error instanceof Error && error.name === "AbortError" ? "درخواست درگاه timeout شد" : "سرور درگاه در دسترس نیست",
    );
  } finally {
    clearTimeout(timeout);
  }
  const raw = await response.json().catch(() => ({}));
  if (!response.ok) throw new GatewayHttpError(response.status, `Gateway error ${response.status}: ${safeJson(raw)}`);
  return { parsed: parseGatewayResponse(raw), raw, payload };
}
