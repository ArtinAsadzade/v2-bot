import { callbackFor } from "../navigation/panel-ui";
import { buildInlineKeyboard } from "./design-system";

export function adminKeyboard() {
  return buildInlineKeyboard([
    [
      { text: "📊 داشبورد", action: callbackFor("admin.analytics") },
      { text: "📦 محصولات", action: callbackFor("admin.store") },
    ],
    [
      { text: "🧩 Xray Center", action: callbackFor("admin.xrayCenter") },
      { text: "👥 کاربران", action: callbackFor("admin.usersSupport") },
    ],
    [
      { text: "💳 مالی", action: callbackFor("admin.finance") },
      { text: "🆘 تیکت‌ها", action: callbackFor("admin.tickets") },
    ],
    [{ text: "⚙️ تنظیمات", action: callbackFor("admin.botSettings") }],
    [{ text: "🏠 منوی اصلی", action: callbackFor("home") }],
  ]);
}
