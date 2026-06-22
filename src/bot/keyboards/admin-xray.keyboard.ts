import { callbackFor } from "../navigation/panel-ui";
import { buildInlineKeyboard } from "./design-system";
import { adminLabels } from "../ui/labels";

export function adminXrayKeyboard() {
  return buildInlineKeyboard([
    [{ text: "🔄 تست اتصال پنل", action: "admin:xray:test", tone: "primary" }, { text: "📡 لیست اینباندها", action: callbackFor("admin.xrayClients") }],
    [{ text: "🔍 بررسی کلاینت", action: callbackFor("admin.xrayClients") }, { text: "🛠 تعمیر کلاینت", action: "admin:xray:repair:client", tone: "warning" }],
    [{ text: "🧹 پاکسازی خراب‌ها", action: "admin:danger:xray_cleanup", tone: "danger" }, { text: "📊 گزارش Sync", action: callbackFor("admin.xrayClients") }],
    [{ text: adminLabels.adminBack, action: callbackFor("admin.dashboard") }],
  ]);
}
