import { joinSections, section } from "../ui/layout";
import { sectionTitles } from "../ui/sections";
import { statusLabels } from "../ui/labels";

export function productCardMessage(input: { title: string; traffic: string; duration: string; price: string; available: boolean }) {
  return section(`📦 ${input.title}`, [`📊 حجم: ${input.traffic}`, `⏳ مدت: ${input.duration}`, `💳 قیمت: ${input.price}`, input.available ? statusLabels.available : statusLabels.unavailable]);
}

export function productDetailMessage(input: { title: string; traffic: string; duration: string; price: string; discount?: string; finalAmount: string }) {
  return joinSections([
    section(sectionTitles.serviceSpecs, [`📦 نام سرویس: ${input.title}`, `📊 حجم: ${input.traffic}`, `⏳ مدت: ${input.duration}`]),
    section(sectionTitles.price, [`💳 قیمت: ${input.price}`, input.discount ? `🎟 تخفیف: ${input.discount}` : undefined, `✅ مبلغ نهایی: ${input.finalAmount}`]),
  ]);
}
