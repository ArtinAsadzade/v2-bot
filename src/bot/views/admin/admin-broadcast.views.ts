import { registerView, BroadcastService, BROADCAST_TARGET_LABELS } from "./admin-helpers";

export function registerAdminBroadcastViews() {
  registerView("admin.notifications", async () => {
    const [targets, recent] = await Promise.all([BroadcastService.targetStats(), BroadcastService.recent(5)]);

    const targetLines = targets.map((item) => `• ${item.label}: ${item.count.toLocaleString("fa-IR")} نفر`).join("\n");

    const recentLines =
      recent
        .map(
          (item) =>
            `• ${item.createdAt.toLocaleString("fa-IR")} · ${item.targetLabel}
  ارسال: ${item.sent.toLocaleString("fa-IR")} · تحویل: ${item.delivered.toLocaleString("fa-IR")} · ناموفق: ${item.failed.toLocaleString("fa-IR")}`,
        )
        .join("\n") || "هنوز اطلاع‌رسانی ثبت نشده است.";

    return {
      text: `📢 اطلاع‌رسانی همگانی

از این بخش می‌توانید پیام مدیریتی را برای گروه‌های مشخص ارسال کنید.

آمار مخاطبان:
${targetLines}

آخرین ارسال‌ها:
${recentLines}`,
      keyboard: [
        [
          {
            text: `📣 ${BROADCAST_TARGET_LABELS.all_users}`,
            action: "flow:start:broadcast_create:all_users",
          },
        ],
        [
          {
            text: `✅ ${BROADCAST_TARGET_LABELS.active_customers}`,
            action: "flow:start:broadcast_create:active_customers",
          },
          {
            text: `🕒 ${BROADCAST_TARGET_LABELS.inactive_customers}`,
            action: "flow:start:broadcast_create:inactive_customers",
          },
        ],
        [
          {
            text: `🗄 ${BROADCAST_TARGET_LABELS.users_with_active_accounts}`,
            action: "flow:start:broadcast_create:users_with_active_accounts",
          },
        ],
        [
          {
            text: `📭 ${BROADCAST_TARGET_LABELS.users_without_active_accounts}`,
            action: "flow:start:broadcast_create:users_without_active_accounts",
          },
        ],
      ],
    };
  });
}
