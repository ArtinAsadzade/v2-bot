import type { AppBot } from "../../../../types/bot";
import { renderPanel } from "../../../navigation/panel-ui";
import { isAdminByTelegramId } from "../../../middlewares/admin.middleware";
import { XrayDiagnosticsService } from "../../../../modules/xray/xray-diagnostics.service";

export function registerAdminXrayHandlers(bot: AppBot) {
  bot.action("admin:xray:center:test-api", async (ctx) => {
    await ctx.answerCbQuery("در حال تست اتصال پنل...");
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return;
    const result = await XrayDiagnosticsService.testPanelApi();
    await ctx.reply(result.ok ? `✅ اتصال پنل برقرار است. تعداد اینباندها: ${result.inboundCount.toLocaleString("fa-IR")}` : `❌ اتصال پنل برقرار نشد: ${result.error}`);
    await renderPanel(ctx, { id: "admin.xrayCenter" }, "replace");
  });
  bot.action("admin:xray:center:test-sub", async (ctx) => {
    await ctx.answerCbQuery("در حال تست لینک اشتراک...");
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return;
    const result = await XrayDiagnosticsService.testSubscriptionUrl();
    await ctx.reply(result.ok ? `✅ لینک اشتراک در دسترس است: ${result.url}` : `❌ لینک اشتراک در دسترس نیست: ${result.error}`);
  });
  bot.action(/^admin:xray:center:verify:([^:]+)$/, async (ctx) => {
    await ctx.answerCbQuery("در حال بررسی کاربر Xray...");
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return;
    const result = await XrayDiagnosticsService.verifyXrayClient(ctx.match[1]);
    await ctx.reply(result.ok ? `✅ کاربر Xray تایید شد\nشناسه اشتراک: ${result.clientSubId ?? "—"}` : `❌ تایید کاربر ناموفق بود\nدلیل: ${result.reason}\n${result.details ?? ""}`);
  });
  bot.action(/^admin:xray:center:repair:([^:]+)$/, async (ctx) => {
    await ctx.answerCbQuery("در حال تعمیر کاربر Xray...");
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return;
    const result = await XrayDiagnosticsService.repairClient(ctx.match[1], String(ctx.from.id));
    await ctx.reply(result.ok ? "✅ تعمیر با موفقیت انجام و تایید شد." : `❌ تعمیر انجام شد اما کاربر فعال نشد: ${result.verified.reason}`);
    await renderPanel(ctx, { id: "admin.xrayCenter" }, "replace");
  });
  bot.action("admin:xray:center:cleanup", async (ctx) => {
    await ctx.answerCbQuery("در حال همگام‌سازی...");
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return;
    const report = await XrayDiagnosticsService.cleanupBrokenClients(String(ctx.from.id));
    await ctx.reply(`✅ همگام‌سازی انجام شد\nبررسی‌شده: ${report.scanned.toLocaleString("fa-IR")}\nمفقود در پنل: ${report.missing.toLocaleString("fa-IR")}\nداده قدیمی: ${report.stale.toLocaleString("fa-IR")}\nآیتم سفارش غیرفعال‌شده: ${report.deactivatedItems.toLocaleString("fa-IR")}`);
    await renderPanel(ctx, { id: "admin.xrayCenter" }, "replace");
  });
}
