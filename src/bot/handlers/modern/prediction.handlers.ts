import type { AppBot } from "../../../types/bot";
import { Markup } from "telegraf";
import { callbackFor, renderPanel, actionFor } from "../../navigation/panel-ui";
import { resolveCallbackToken, deleteCallbackToken, createCallbackToken, tokenAction } from "../../navigation/callback-tokens";
import { UserService } from "../../../modules/user/user.service";
import { PredictionService } from "../../../modules/prediction/prediction.service";
import { prisma } from "../../../services/prisma";
import { isAdminByTelegramId } from "../../middlewares/admin.middleware";

const db = prisma as any;

export function registerPredictionHandlers(bot: AppBot) {
  bot.action(/^pr:p:([^:]+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const payload = resolveCallbackToken(ctx, "predictionPick", ctx.match[1]);
    if (!payload) return void (await ctx.reply("❌ انتخاب منقضی شده است."));
    const option = await db.predictionOption.findUnique({ where: { id: payload.optionId } });
    const confirmToken = createCallbackToken(ctx, "predictionPick", payload);
    await ctx.reply(`گزینه انتخابی شما: ${option?.title ?? "گزینه"}`, Markup.inlineKeyboard([[Markup.button.callback("✅ ثبت نهایی پیش‌بینی", tokenAction("pr:c", confirmToken))], [Markup.button.callback("🔙 تغییر گزینه", callbackFor("prediction.detail", { contestId: payload.contestId }))]]));
  });

  bot.action(/^pr:c:([^:]+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const payload = resolveCallbackToken(ctx, "predictionPick", ctx.match[1]);
    if (!payload || !ctx.from) return void (await ctx.reply("❌ درخواست معتبر نیست."));
    try {
      const user = await UserService.findOrCreateUser(ctx);
      await PredictionService.submitPrediction(payload.contestId, payload.optionId, { id: user.id, telegramId: String(ctx.from.id) });
      deleteCallbackToken(ctx, ctx.match[1]);
      await ctx.reply("✅ پیش‌بینی شما ثبت شد.");
      await renderPanel(ctx, { id: "prediction.detail", params: { contestId: payload.contestId } }, "replace");
    } catch (error) { await ctx.reply(error instanceof Error ? error.message : "❌ ثبت پیش‌بینی انجام نشد."); }
  });

  bot.action(/^pr:cl:([^:]+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const payload = resolveCallbackToken(ctx, "predictionClaim", ctx.match[1]);
    if (!payload || !ctx.from) return void (await ctx.reply("❌ دکمه دریافت جایزه منقضی شده است."));
    try {
      const result = await PredictionService.claimReward(payload.winnerId, String(ctx.from.id));
      await ctx.reply(result.alreadyClaimed ? "✅ جایزه شما قبلاً دریافت شده است." : "🎁 جایزه شما با موفقیت دریافت شد.");
    } catch (error) { await ctx.reply(error instanceof Error ? error.message : "❌ دریافت جایزه انجام نشد. لطفاً با پشتیبانی تماس بگیرید."); }
  });

  bot.action(/^ap:res:([^:]+):([^:]+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return void (await ctx.reply("دسترسی غیرمجاز"));
    await PredictionService.setResult(ctx.match[1], ctx.match[2], ctx.from.id);
    await ctx.reply("✅ نتیجه تأیید و ثبت شد. پیش‌بینی‌های درست و نادرست مشخص شدند.");
    await renderPanel(ctx, { id: "admin.predictionDetail", params: { contestId: ctx.match[1] } }, "replace");
  });

  bot.action(/^ap:win:([^:]+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return void (await ctx.reply("دسترسی غیرمجاز"));
    try {
      const winners = await PredictionService.selectWinners(ctx.match[1]);
      await ctx.reply(`🏆 برنده‌ها انتخاب شدند.\nتعداد برنده‌ها: ${winners.length.toLocaleString("fa-IR")}\nاگر قبلاً انتخاب شده باشند، همان لیست قبلی نمایش داده می‌شود.`);
      await renderPanel(ctx, { id: "admin.predictionDetail", params: { contestId: ctx.match[1] } }, "replace");
    } catch (e) { await ctx.reply(e instanceof Error ? e.message : "❌ انتخاب برنده‌ها انجام نشد."); }
  });

  bot.action(/^ap:ann:([^:]+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return void (await ctx.reply("دسترسی غیرمجاز"));
    const contest = await db.predictionContest.findUnique({ where:{ id: ctx.match[1] }, include:{ entries:true, winners:true } });
    if (!contest?.winners?.length) return void (await ctx.reply("ابتدا برنده‌ها را انتخاب کنید."));
    if (contest.status === "announced") return void (await ctx.reply("📣 نتایج قبلاً اعلام شده‌اند."));
    let sent = 0, failed = 0;
    const winnerByUser = new Map(contest.winners.map((w:any)=>[w.userId, w]));
    for (const entry of contest.entries) {
      try {
        const winner = winnerByUser.get(entry.userId) as any;
        if (winner) {
          const token = createCallbackToken(ctx, "predictionClaim", { winnerId: winner.id });
          await ctx.telegram.sendMessage(entry.telegramId, "🎉 تبریک! پیش‌بینی شما درست بود و شما برنده شدید.", Markup.inlineKeyboard([[Markup.button.callback("🎁 دریافت جایزه", tokenAction("pr:cl", token))]]));
          await db.predictionWinner.update({ where:{ id: winner.id }, data:{ status:"notified", notifiedAt: new Date() } });
        } else if (entry.status === "correct") await ctx.telegram.sendMessage(entry.telegramId, "✅ پیش‌بینی شما درست بود، اما این بار جزو برنده‌ها نبودید.");
        else await ctx.telegram.sendMessage(entry.telegramId, "❌ پیش‌بینی شما درست نبود. شانس خودتان را در پیش‌بینی‌های بعدی امتحان کنید.");
        sent++;
      } catch (error) { failed++; await db.predictionAuditLog.create({ data:{ contestId: contest.id, userId: entry.userId, action:"announce.failed", metadata:{ message: error instanceof Error ? error.message : "unknown" } } }); }
    }
    await db.predictionContest.update({ where:{ id: contest.id }, data:{ status:"announced", announcedAt: new Date() } });
    await ctx.reply(`📣 اعلام نتایج انجام شد.\nارسال موفق: ${sent.toLocaleString("fa-IR")}\nناموفق: ${failed.toLocaleString("fa-IR")}`);
  });

  bot.action(/^ap:close:([^:]+)$/, async (ctx) => { await ctx.answerCbQuery(); await db.predictionContest.update({ where:{ id: ctx.match[1] }, data:{ status:"closed" } }); await renderPanel(ctx, { id:"admin.predictionDetail", params:{ contestId: ctx.match[1] } }, "replace"); });
  bot.action(/^ap:arc:([^:]+)$/, async (ctx) => { await ctx.answerCbQuery(); await db.predictionContest.update({ where:{ id: ctx.match[1] }, data:{ status:"archived", archivedAt:new Date() } }); await renderPanel(ctx, { id:"admin.predictions" }, "replace"); });
  bot.action(/^ap:del:([^:]+)$/, async (ctx) => { await ctx.answerCbQuery(); const count=await db.predictionEntry.count({ where:{ contestId: ctx.match[1] } }); if(count) return void(await ctx.reply("❌ حذف فقط زمانی مجاز است که شرکت‌کننده‌ای وجود نداشته باشد.")); await db.predictionContest.delete({ where:{ id: ctx.match[1] } }); await renderPanel(ctx, { id:"admin.predictions" }, "replace"); });
}
