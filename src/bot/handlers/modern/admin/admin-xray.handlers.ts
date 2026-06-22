import type { AppBot } from "../../../../types/bot";
import { renderPanel } from "../../../navigation/panel-ui";
import { isAdminByTelegramId } from "../../../middlewares/admin.middleware";
import { XrayDiagnosticsService } from "../../../../modules/xray/xray-diagnostics.service";

export function registerAdminXrayHandlers(bot: AppBot) {
  bot.action("admin:xray:center:test-api", async (ctx) => {
    await ctx.answerCbQuery("در حال تست API...");
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return;
    const result = await XrayDiagnosticsService.testPanelApi();
    await ctx.reply(result.ok ? `✅ API سالم است. اینباندها: ${result.inboundCount}` : `❌ API قطع است: ${result.error}`);
    await renderPanel(ctx, { id: "admin.xrayCenter" }, "replace");
  });
  bot.action("admin:xray:center:test-sub", async (ctx) => {
    await ctx.answerCbQuery("در حال تست لینک اشتراک...");
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return;
    const result = await XrayDiagnosticsService.testSubscriptionUrl();
    await ctx.reply(result.ok ? `✅ لینک اشتراک در دسترس است: ${result.url}` : `❌ لینک اشتراک در دسترس نیست: ${result.error}`);
  });
  bot.action(/^admin:xray:center:verify:([^:]+)$/, async (ctx) => {
    await ctx.answerCbQuery("در حال بررسی کلاینت...");
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return;
    const result = await XrayDiagnosticsService.verifyXrayClient(ctx.match[1]);
    await ctx.reply(result.ok ? `✅ کلاینت تایید شد\nSubId: ${result.clientSubId ?? "—"}` : `❌ تایید نشد\nReason: ${result.reason}\n${result.details ?? ""}`);
  });
  bot.action(/^admin:xray:center:repair:([^:]+)$/, async (ctx) => {
    await ctx.answerCbQuery("در حال تعمیر کلاینت...");
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return;
    const result = await XrayDiagnosticsService.repairClient(ctx.match[1], String(ctx.from.id));
    await ctx.reply(result.ok ? "✅ تعمیر با موفقیت انجام و تایید شد." : `❌ تعمیر انجام شد اما فعال نشد: ${result.verified.reason}`);
    await renderPanel(ctx, { id: "admin.xrayCenter" }, "replace");
  });
  bot.action("admin:xray:center:cleanup", async (ctx) => {
    await ctx.answerCbQuery("در حال پاکسازی...");
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return;
    const report = await XrayDiagnosticsService.cleanupBrokenClients(String(ctx.from.id));
    await ctx.reply(`✅ پاکسازی انجام شد\nScanned: ${report.scanned}\nMissing: ${report.missing}\nStale: ${report.stale}\nOrderItems غیرفعال: ${report.deactivatedItems}`);
    await renderPanel(ctx, { id: "admin.xrayCenter" }, "replace");
  });
}
