"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateAccountDisplayStatus = calculateAccountDisplayStatus;
exports.formatDisplayAccountStatus = formatDisplayAccountStatus;
function asDate(value) { return value ? new Date(value) : null; }
function calculateAccountDisplayStatus(input, now = new Date()) {
    if (input.legacy)
        return "legacy";
    if (input.hasRequiredDeliveryData === false)
        return "broken";
    if (input.deletedAt || input.disabledAt || input.status === "disabled" || input.status === "deleted")
        return "disabled";
    if (input.productActive === false)
        return "disabled";
    const expiresAt = asDate(input.expiresAt);
    if (input.status === "expired" || (expiresAt && expiresAt <= now))
        return "expired";
    if (["available", "reserved", "failed", "missing_on_panel", "renewal_failed"].includes(String(input.status)))
        return "broken";
    return "active";
}
function formatDisplayAccountStatus(status) {
    return { active: "فعال", expired: "منقضی", disabled: "غیرفعال", broken: "خراب/ناقص", legacy: "قدیمی" }[status];
}
