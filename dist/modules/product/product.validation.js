"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProductValidationError = void 0;
exports.validateProductName = validateProductName;
exports.normalizeNumericInput = normalizeNumericInput;
exports.isProductValidationError = isProductValidationError;
exports.productValidationError = productValidationError;
exports.validatePositiveInteger = validatePositiveInteger;
exports.validateNonNegativeInteger = validateNonNegativeInteger;
exports.validateNonNegativeNumber = validateNonNegativeNumber;
exports.isValidationError = isValidationError;
exports.normalizeProductMode = normalizeProductMode;
function validateProductName(value) {
    const title = String(value ?? "").trim();
    if (!title)
        throw productValidationError("❌ نام محصول الزامی است و نمی‌تواند خالی باشد.");
    return title;
}
function normalizeNumericInput(value) {
    if (typeof value !== "string")
        return value;
    const fa = "۰۱۲۳۴۵۶۷۸۹";
    const ar = "٠١٢٣٤٥٦٧٨٩";
    return value.replace(/[۰-۹٠-٩]/g, (d) => {
        const fi = fa.indexOf(d);
        if (fi >= 0)
            return String(fi);
        const ai = ar.indexOf(d);
        return ai >= 0 ? String(ai) : d;
    }).replace(/[,،\s]/g, "");
}
class ProductValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = "ProductValidationError";
    }
}
exports.ProductValidationError = ProductValidationError;
function isProductValidationError(error) {
    return error instanceof ProductValidationError || (error instanceof Error && error.message.trim().startsWith("❌"));
}
function productValidationError(message) {
    return new ProductValidationError(message);
}
function validatePositiveInteger(value, label) {
    const normalized = normalizeNumericInput(value);
    const number = Number(normalized);
    if (!Number.isInteger(number) || number <= 0)
        throw productValidationError(`❌ ${label} باید عدد صحیح بزرگ‌تر از صفر باشد.`);
    return number;
}
function validateNonNegativeInteger(value, label, message) {
    const normalized = normalizeNumericInput(value);
    const number = Number(normalized);
    if (!Number.isInteger(number) || number < 0)
        throw productValidationError(message ?? `❌ ${label} باید عدد صحیح صفر یا بزرگ‌تر باشد.`);
    return number;
}
function validateNonNegativeNumber(value, message) {
    const normalized = normalizeNumericInput(value);
    const number = Number(normalized);
    if (!Number.isFinite(number) || number < 0)
        throw productValidationError(message);
    return number;
}
function isValidationError(error) {
    return error instanceof Error && error.message.trim().startsWith("❌");
}
function normalizeProductMode(value) {
    return value === "manual_inventory" || value === "xray_auto" ? value : undefined;
}
