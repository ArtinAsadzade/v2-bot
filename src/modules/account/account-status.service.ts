export type DisplayAccountStatus = "active" | "expired" | "disabled" | "broken" | "legacy";

type MaybeDate = Date | string | null | undefined;
function asDate(value: MaybeDate) { return value ? new Date(value) : null; }

export function calculateAccountDisplayStatus(input: {
  status?: string | null;
  expiresAt?: MaybeDate;
  disabledAt?: MaybeDate;
  deletedAt?: MaybeDate;
  productActive?: boolean | null;
  hasRequiredDeliveryData?: boolean;
  legacy?: boolean;
}, now = new Date()): DisplayAccountStatus {
  if (input.legacy) return "legacy";
  if (input.hasRequiredDeliveryData === false) return "broken";
  if (input.deletedAt || input.disabledAt || input.status === "disabled" || input.status === "deleted") return "disabled";
  if (input.productActive === false) return "disabled";
  const expiresAt = asDate(input.expiresAt);
  if (input.status === "expired" || (expiresAt && expiresAt <= now)) return "expired";
  if (["available", "reserved", "failed", "missing_on_panel", "renewal_failed"].includes(String(input.status))) return "broken";
  return "active";
}

export function formatDisplayAccountStatus(status: DisplayAccountStatus) {
  return ({ active: "فعال", expired: "منقضی", disabled: "غیرفعال", broken: "خراب/ناقص", legacy: "قدیمی" } as const)[status];
}
