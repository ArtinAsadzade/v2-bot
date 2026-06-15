export type ProductModeInput = "manual_inventory" | "xray_auto";

export function validateProductName(value: unknown) {
  const title = String(value ?? "").trim();
  if (!title) throw productValidationError("❌ نام محصول الزامی است و نمی‌تواند خالی باشد.");
  return title;
}

export function normalizeNumericInput(value: unknown) {
  if (typeof value !== "string") return value;
  const fa = "۰۱۲۳۴۵۶۷۸۹";
  const ar = "٠١٢٣٤٥٦٧٨٩";
  return value.replace(/[۰-۹٠-٩]/g, (d) => {
    const fi = fa.indexOf(d);
    if (fi >= 0) return String(fi);
    const ai = ar.indexOf(d);
    return ai >= 0 ? String(ai) : d;
  }).replace(/[,،\s]/g, "");
}

export class ProductValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductValidationError";
  }
}

export function isProductValidationError(error: unknown): error is ProductValidationError {
  return error instanceof ProductValidationError || (error instanceof Error && error.message.trim().startsWith("❌"));
}

export function productValidationError(message: string): ProductValidationError {
  return new ProductValidationError(message);
}

export function validatePositiveInteger(value: unknown, label: string) {
  const normalized = normalizeNumericInput(value);
  const number = Number(normalized);
  if (!Number.isInteger(number) || number <= 0) throw productValidationError(`❌ ${label} باید عدد صحیح بزرگ‌تر از صفر باشد.`);
  return number;
}

export function validateNonNegativeInteger(value: unknown, label: string, message?: string) {
  const normalized = normalizeNumericInput(value);
  const number = Number(normalized);
  if (!Number.isInteger(number) || number < 0) throw productValidationError(message ?? `❌ ${label} باید عدد صحیح صفر یا بزرگ‌تر باشد.`);
  return number;
}

export function validateNonNegativeNumber(value: unknown, message: string) {
  const normalized = normalizeNumericInput(value);
  const number = Number(normalized);
  if (!Number.isFinite(number) || number < 0) throw productValidationError(message);
  return number;
}

export function isValidationError(error: unknown): error is Error {
  return error instanceof Error && error.message.trim().startsWith("❌");
}

export function normalizeProductMode(value: unknown): ProductModeInput | undefined {
  return value === "manual_inventory" || value === "xray_auto" ? value : undefined;
}
