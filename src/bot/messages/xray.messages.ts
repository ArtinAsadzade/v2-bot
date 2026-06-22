import { statusLabels } from "../ui/labels";

export function xrayCenterMessage(input: { apiHealthy: boolean; inboundCount: number; missingClients: number; brokenSubscriptions: number }) {
  return [`🧩 Xray Center`, `وضعیت API: ${input.apiHealthy ? statusLabels.xrayHealthy : statusLabels.xrayDown}`, `📡 اینباندها: ${input.inboundCount.toLocaleString("fa-IR")}`, `⚠️ کلاینت‌های مفقود: ${input.missingClients.toLocaleString("fa-IR")}`, `🔗 اشتراک‌های خراب: ${input.brokenSubscriptions.toLocaleString("fa-IR")}`].join("\n");
}
