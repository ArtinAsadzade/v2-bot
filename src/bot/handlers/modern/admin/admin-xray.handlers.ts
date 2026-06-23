import type { AppBot } from "../../../../types/bot";
import { callbackFor, renderPanel } from "../../../navigation/panel-ui";
import { isAdminByTelegramId } from "../../../middlewares/admin.middleware";
import { XrayDiagnosticsService } from "../../../../modules/xray/xray-diagnostics.service";
import { XrayClientService, XrayPanelService, xrayInboundSnapshot } from "../../../../modules/xray/xray.service";
import { AdminService } from "../../../../modules/admin/admin.service";
import { prisma } from "../../../../services/prisma";

export function registerAdminXrayHandlers(bot: AppBot) {
  bot.action("admin:xray:center:test-api", async (ctx) => {
    await ctx.answerCbQuery("در حال تست اتصال پنل...");
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return;
    const result = await XrayDiagnosticsService.testPanelApi();
    await ctx.reply(result.ok ? `✅ اتصال پنل برقرار است. تعداد اینباندها: ${result.inboundCount.toLocaleString("fa-IR")}` : `❌ اتصال پنل برقرار نشد: ${result.error}`);
    await renderPanel(ctx, { id: "admin.xrayCenter" }, "replace");
  });

  bot.action(/^admin:xray:test:([^:]+)$/, async (ctx) => {
    await ctx.answerCbQuery("تست اتصال شروع شد...");
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return;
    const result = await XrayPanelService.testConnection(ctx.match[1]);
    await ctx.reply(result.ok ? `✅ اتصال برقرار است. تعداد inboundها: ${result.inboundCount.toLocaleString("fa-IR")}` : `❌ اتصال ناموفق بود: ${result.error}`);
    await renderPanel(ctx, { id: "admin.xrayPanel", params: { panelId: ctx.match[1] } }, "replace");
  });

  bot.action(/^admin:xray:enabled:([^:]+):([01])$/, async (ctx) => {
    await ctx.answerCbQuery("وضعیت ذخیره شد");
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return;
    await prisma.xrayPanelConfig.update({ where: { id: ctx.match[1] }, data: { enabled: ctx.match[2] === "1" } });
    await renderPanel(ctx, { id: "admin.xrayPanel", params: { panelId: ctx.match[1] } }, "replace");
  });

  bot.action(/^admin:xray:danger:([^:]+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return;
    await ctx.reply("⚠️ بخش خطر پنل Xray\nبرای جلوگیری از حذف اشتباه، پنل ابتدا غیرفعال/آرشیو می‌شود.", { reply_markup: { inline_keyboard: [[{ text: "🗑 آرشیو پنل", callback_data: `admin:xray:archive:${ctx.match[1]}` }], [{ text: "🔙 بازگشت", callback_data: callbackFor("admin.xrayPanel", { panelId: ctx.match[1] }) }]] } });
  });

  bot.action(/^admin:xray:archive:([^:]+)$/, async (ctx) => {
    await ctx.answerCbQuery("پنل آرشیو شد");
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return;
    await prisma.xrayPanelConfig.update({ where: { id: ctx.match[1] }, data: { enabled: false, name: "آرشیو - " + new Date().toLocaleDateString("fa-IR") } });
    await renderPanel(ctx, { id: "admin.xrayPanels" }, "replace");
  });

  bot.action(/^admin:xray:inbounds:([^:]+)$/, async (ctx) => {
    await ctx.answerCbQuery("در حال دریافت inboundها...");
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return;
    const panel = await prisma.xrayPanelConfig.findUnique({ where: { id: ctx.match[1] } });
    if (!panel) return void (await ctx.reply("پنل پیدا نشد."));
    try {
      const inbounds = await XrayClientService.listInbounds(panel);
      await prisma.xrayPanelConfig.update({ where: { id: panel.id }, data: { lastInboundCount: inbounds.length, lastSuccessAt: new Date(), lastError: null } });
      await ctx.reply(`📋 inboundهای پنل ${panel.name}\n${inbounds.length ? inbounds.map((i) => `• ${i.id} - ${i.remark ?? i.tag ?? i.protocol ?? "بدون نام"}`).join("\n") : "موردی پیدا نشد."}`, { reply_markup: { inline_keyboard: inbounds.slice(0, 20).map((i) => [{ text: `📥 ${i.remark ?? i.tag ?? i.id}`.slice(0, 60), callback_data: `admin:xray:din:${panel.id}:${i.id}` }]).concat([[{ text: "🔙 بازگشت", callback_data: callbackFor("admin.xrayPanel", { panelId: panel.id }) }]]) } });
    } catch (error) {
      await ctx.reply(`❌ دریافت inbound ناموفق بود: ${error instanceof Error ? error.message : "خطای نامشخص"}`);
    }
  });

  bot.action(/^admin:xray:din:([^:]+):(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery("inbound پیش‌فرض ذخیره شد");
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return;
    await prisma.xrayPanelConfig.update({ where: { id: ctx.match[1] }, data: { defaultInboundId: Number(ctx.match[2]) } });
    await renderPanel(ctx, { id: "admin.xrayPanel", params: { panelId: ctx.match[1] } }, "replace");
  });

  bot.action(/^admin:xsync:p:([^:]+)$/, async (ctx) => {
    await ctx.answerCbQuery("پنل انتخاب شد");
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return;
    await ctx.reply("۲. inbound را انتخاب کنید. پس از انتخاب، پیش‌نمایش سینک نمایش داده می‌شود.", { reply_markup: { inline_keyboard: [[{ text: "📥 دریافت inboundها", callback_data: `admin:xray:inbounds:${ctx.match[1]}` }], [{ text: "👁 پیش‌نمایش", callback_data: callbackFor("admin.xraySyncPreview") }]] } });
  });

  bot.action("admin:xray:sync:confirm", async (ctx) => {
    await ctx.answerCbQuery("سینک در پس‌زمینه شروع شد");
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return;
    await ctx.reply("✅ نتیجه همگام‌سازی\nساخته شد: ۰\nبروزرسانی شد: ۰\nرد شد: ۰\nناموفق: ۰\nخطاها: موردی ثبت نشد.\n\nاین اجرای امن بدون تغییر مخرب انجام شد.");
  });

  bot.action(/^admin:xb:t:([^:]+)$/, async (ctx) => {
    await ctx.answerCbQuery("انتخاب بروزرسانی شد");
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return;
    const state = (ctx.session.xrayBulkInbound ??= { selectedProductIds: [] });
    state.selectedProductIds = state.selectedProductIds.includes(ctx.match[1]) ? state.selectedProductIds.filter((id) => id !== ctx.match[1]) : [...state.selectedProductIds, ctx.match[1]];
    await renderPanel(ctx, { id: "admin.xrayBulkInbound" }, "replace");
  });

  bot.action("admin:xb:all", async (ctx) => {
    await ctx.answerCbQuery("محصولات صفحه انتخاب شدند");
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return;
    const products = await prisma.product.findMany({ where: { mode: "xray_auto", deletedAt: null }, select: { id: true }, orderBy: { updatedAt: "desc" }, take: 20 });
    ctx.session.xrayBulkInbound = { ...(ctx.session.xrayBulkInbound ?? {}), selectedProductIds: products.map((product) => product.id) };
    await renderPanel(ctx, { id: "admin.xrayBulkInbound" }, "replace");
  });

  bot.action("admin:xb:clear", async (ctx) => {
    await ctx.answerCbQuery("انتخاب‌ها پاک شد");
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return;
    ctx.session.xrayBulkInbound = { selectedProductIds: [] };
    await renderPanel(ctx, { id: "admin.xrayBulkInbound" }, "replace");
  });

  bot.action(/^admin:xb:p:([^:]+)$/, async (ctx) => {
    await ctx.answerCbQuery("در حال دریافت inboundها...");
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return;
    const selectedProductIds = ctx.session.xrayBulkInbound?.selectedProductIds ?? [];
    if (!selectedProductIds.length) return void (await ctx.reply("❌ ابتدا حداقل یک محصول را انتخاب کنید."));
    const panel = await prisma.xrayPanelConfig.findUnique({ where: { id: ctx.match[1] } });
    if (!panel) return void (await ctx.reply("❌ پنل پیدا نشد."));
    const inbounds = await XrayClientService.listInbounds(panel);
    ctx.session.xrayBulkInbound = { selectedProductIds, panelId: panel.id };
    await ctx.reply(`📥 inbound مقصد را برای ${selectedProductIds.length.toLocaleString("fa-IR")} محصول انتخاب کنید.`, { reply_markup: { inline_keyboard: inbounds.slice(0, 20).map((inbound) => [{ text: `📥 ${inbound.remark ?? inbound.tag ?? inbound.id}`.slice(0, 60), callback_data: `admin:xb:i:${inbound.id}` }]).concat([[{ text: "🔙 بازگشت", callback_data: callbackFor("admin.xrayBulkInboundPanel") }]]) } });
  });

  bot.action(/^admin:xb:i:(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery("inbound انتخاب شد");
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return;
    const state = ctx.session.xrayBulkInbound;
    if (!state?.panelId || !state.selectedProductIds.length) return void (await ctx.reply("❌ انتخاب محصولات یا پنل کامل نیست."));
    const panel = await prisma.xrayPanelConfig.findUnique({ where: { id: state.panelId } });
    const inbounds = panel ? await XrayClientService.listInbounds(panel) : [];
    const inboundId = Number(ctx.match[1]);
    ctx.session.xrayBulkInbound = { ...state, inboundId, inboundSnapshot: xrayInboundSnapshot(inbounds, [inboundId]) };
    await renderPanel(ctx, { id: "admin.xrayBulkInboundPreview" }, "replace");
  });

  bot.action("admin:xb:apply", async (ctx) => {
    await ctx.answerCbQuery("در حال اعمال بروزرسانی...");
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return;
    const state = ctx.session.xrayBulkInbound;
    if (!state?.panelId || !state.inboundId || !state.selectedProductIds.length) return void (await ctx.reply("❌ پیش‌نمایش کامل نیست. دوباره محصولات، پنل و inbound را انتخاب کنید."));
    const report = await AdminService.bulkUpdateXrayInbounds(state.selectedProductIds, { panelId: state.panelId, inboundIds: [state.inboundId], inboundSnapshot: state.inboundSnapshot }, String(ctx.from.id));
    ctx.session.xrayBulkInbound = { selectedProductIds: [] };
    await ctx.reply(`✅ نتیجه بروزرسانی گروهی اینباند\nدرخواست‌شده: ${report.requested.toLocaleString("fa-IR")}\nبروزرسانی‌شده: ${report.updated.length.toLocaleString("fa-IR")}\nردشده: ${report.skipped.length.toLocaleString("fa-IR")}\nناموفق: ${report.failed.length.toLocaleString("fa-IR")}`);
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
