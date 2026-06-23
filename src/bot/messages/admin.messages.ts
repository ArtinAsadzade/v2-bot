import { joinSections, section } from "../ui/layout";
import { sectionTitles } from "../ui/sections";

export function adminDashboardMessage(input: {
  todayRevenue: string;
  todayOrders: number;
  pendingPayments: number;
  activeUsers: number;
  xrayHealth: string;
  openTickets: number;
}) {
  return joinSections([
    "📊 داشبورد مدیریت",
    section(sectionTitles.adminMetrics, [
      `💰 درآمد امروز: ${input.todayRevenue}`,
      `🧾 سفارش‌های امروز: ${input.todayOrders.toLocaleString("fa-IR")}`,
      `⏳ پرداخت‌های در انتظار: ${input.pendingPayments.toLocaleString("fa-IR")}`,
      `👥 کاربران فعال: ${input.activeUsers.toLocaleString("fa-IR")}`,
    ]),
    section(sectionTitles.xrayHealth, [input.xrayHealth, `🆘 تیکت‌های باز: ${input.openTickets.toLocaleString("fa-IR")}`]),
  ]);
}

export function adminDangerConfirmMessage(input: { action: string; item: string; note?: string }) {
  return [`⚠️ آیا مطمئن هستید؟`, `عملیات: ${input.action}`, `مورد اثر: ${input.item}`, input.note ?? "این عملیات ممکن است قابل بازگشت نباشد."].join(
    "\n",
  );
}
