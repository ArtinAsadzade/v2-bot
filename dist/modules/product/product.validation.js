"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateProductName = validateProductName;
exports.validatePositiveInteger = validatePositiveInteger;
exports.validateNonNegativeInteger = validateNonNegativeInteger;
exports.normalizeProductMode = normalizeProductMode;
function validateProductName(value) {
    const title = String(value ?? "").trim();
    if (!title)
        throw new Error("❌ نام محصول الزامی است و نمی‌تواند خالی باشد.");
    return title;
}
function validatePositiveInteger(value, label) {
    const normalized = typeof value === "string" ? value.replace(/[,،\s]/g, "") : value;
    const number = Number(normalized);
    if (!Number.isInteger(number) || number <= 0)
        throw new Error(`❌ ${label} باید عدد صحیح بزرگ‌تر از صفر باشد.`);
    return number;
}
function validateNonNegativeInteger(value, label) {
    const normalized = typeof value === "string" ? value.replace(/[,،\s]/g, "") : value;
    const number = Number(normalized);
    if (!Number.isInteger(number) || number < 0)
        throw new Error(`❌ ${label} باید عدد صحیح صفر یا بزرگ‌تر باشد.`);
    return number;
}
function normalizeProductMode(value) {
    return value === "manual_inventory" || value === "xray_auto" ? value : undefined;
}
