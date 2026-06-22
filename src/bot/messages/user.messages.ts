import { joinSections, section } from "../ui/layout";
import { sectionTitles } from "../ui/sections";

const nfFa = new Intl.NumberFormat("fa-IR");

export function userHomeMessage(input: { firstName?: string; balance: string; activeServices: number }) {
  return joinSections([
    `سلام ${input.firstName || "دوست عزیز"} 🌿`,
    section(sectionTitles.quickActions, [
      `💳 موجودی کیف پول: ${input.balance}`,
      `📦 سرویس‌های فعال: ${nfFa.format(input.activeServices)}`,
      "یکی از گزینه‌های زیر را انتخاب کنید.",
    ]),
  ]);
}
