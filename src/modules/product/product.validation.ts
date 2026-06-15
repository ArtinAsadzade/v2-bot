export type ProductModeInput = "manual_inventory" | "xray_auto";

export function validateProductName(value: unknown) {
  const title = String(value ?? "").trim();
  if (!title) throw new Error("❌ نام محصول الزامی است و نمی‌تواند خالی باشد.");
  return title;
}

export function validatePositiveInteger(value: unknown, label: string) {
  const normalized = typeof value === "string" ? value.replace(/[,،\s]/g, "") : value;
  const number = Number(normalized);
  if (!Number.isInteger(number) || number <= 0) throw new Error(`❌ ${label} باید عدد صحیح بزرگ‌تر از صفر باشد.`);
  return number;
}

export function validateNonNegativeInteger(value: unknown, label: string) {
  const normalized = typeof value === "string" ? value.replace(/[,،\s]/g, "") : value;
  const number = Number(normalized);
  if (!Number.isInteger(number) || number < 0) throw new Error(`❌ ${label} باید عدد صحیح صفر یا بزرگ‌تر باشد.`);
  return number;
}

export function normalizeProductMode(value: unknown): ProductModeInput | undefined {
  return value === "manual_inventory" || value === "xray_auto" ? value : undefined;
}
