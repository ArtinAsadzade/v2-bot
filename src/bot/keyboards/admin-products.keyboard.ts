import { callbackFor } from "../navigation/panel-ui";
import { buildInlineKeyboard } from "./design-system";
import { adminLabels } from "../ui/labels";

export function adminProductsKeyboard() {
  return buildInlineKeyboard([
    [{ text: "📂 دسته‌بندی‌ها", action: callbackFor("admin.categories") }, { text: "📦 محصولات", action: callbackFor("admin.products") }],
    [{ text: "🧩 محصولات Xray", action: callbackFor("admin.products", { status: "active" }) }, { text: "📥 محصولات موجودی", action: callbackFor("admin.accounts") }],
    [{ text: "⚫ محصولات غیرفعال", action: callbackFor("admin.products", { status: "disabled" }) }],
    [{ text: adminLabels.adminBack, action: callbackFor("admin.dashboard") }],
  ]);
}
