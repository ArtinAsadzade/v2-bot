import { freeAccountExpiresAt } from "../modules/free-account/free-account.service";

export const divider = "━━━━━━━━━━━━━━━━";
export const getPageParam = (params: Record<string, string>) => Math.max(Number(params.page ?? 1), 1);
export const formatPageCount = (total: number, take: number) => Math.max(Math.ceil(total / take), 1).toLocaleString("fa-IR");
export const formatUserLine = (user: { telegramId: string; username?: string | null; firstName?: string | null }) =>
  `${user.firstName ?? "کاربر"} ${user.username ? `@${user.username}` : user.telegramId}`;
export const formatStockLabel = (count: number) =>
  count > 5 ? "آماده تحویل" : count > 0 ? `فقط ${count.toLocaleString("fa-IR")} عدد` : "ناموجود";
export const shortId = (id: string) => id.slice(-6).toUpperCase();
export const resolveFreeAccountExpiry = (item: { assignedAt?: Date | null; createdAt: Date; expiresAt?: Date | null; account: { durationDays: number } }) =>
  item.expiresAt ?? freeAccountExpiresAt(item.assignedAt ?? item.createdAt, item.account.durationDays);
export const yesNoStatus = (value: boolean) => (value ? "فعال ✅" : "غیرفعال ⛔");
export const accountStatusLabel = (status: string) =>
  ({ available: "آماده", reserved: "رزرو", sold: "فروخته", disabled: "غیرفعال", expired: "منقضی" })[status] ?? status;
export const walletStatusLabel = (status: string) => (status === "active" ? "فعال ✅" : "غیرفعال ⛔");
export const paymentStatusLabel = (value: string) =>
  ({ PENDING: "در انتظار بررسی", PAID: "پرداخت‌شده، آماده تحویل", CANCELED: "لغو شده", FAILED: "ناموفق", COMPLETED: "تکمیل شده" } as Record<string, string>)[value] ?? value;
export const progressBar = (current: number, target: number) => {
  const safeTarget = Math.max(target, 1);
  const filled = Math.min(Math.floor((Math.max(current, 0) / safeTarget) * 10), 10);
  return `${"●".repeat(filled)}${"○".repeat(10 - filled)} ${Math.min(Math.round((current / safeTarget) * 100), 100).toLocaleString("fa-IR")}٪`;
};
export const purchasedAccountStatusLabel = (item: { isActive: boolean; expiresAt?: Date | null; productAccount?: { status: string } | null }) => {
  if (item.productAccount?.status === "disabled") return "غیرفعال";
  if (item.productAccount?.status === "expired" || !item.isActive || (item.expiresAt && item.expiresAt <= new Date())) return "منقضی شده";
  return "فعال";
};
