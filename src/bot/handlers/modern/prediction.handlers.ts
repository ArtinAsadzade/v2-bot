import type { AppBot } from "../../../types/bot";
import { Markup } from "telegraf";
import { callbackFor, renderPanel, actionFor } from "../../navigation/panel-ui";
import {
  resolveCallbackToken,
  deleteCallbackToken,
  createCallbackToken,
  tokenAction,
} from "../../navigation/callback-tokens";
import { UserService } from "../../../modules/user/user.service";
import { PredictionService, canSubmitPrediction } from "../../../modules/prediction/prediction.service";
import { RewardService } from "../../../modules/reward/reward.service";
import { productRewardAlreadyClaimedMessage, productRewardClaimKeyboard, productRewardFailedKeyboard, productRewardSuccessMessage } from "../../../modules/reward/reward-messages";
import { prisma } from "../../../services/prisma";
import { isAdminByTelegramId } from "../../middlewares/admin.middleware";

const db = prisma as any;

export function registerPredictionHandlers(bot: AppBot) {
  bot.action(/^pr:p:([^:]+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const payload = resolveCallbackToken(ctx, "predictionPick", ctx.match[1]);
    if (!payload) return void (await ctx.reply("❌ انتخاب منقضی شده است."));
    const contest = await db.predictionContest.findUnique({ where: { id: payload.contestId } });
    if (!contest || contest.status === "archived" || contest.status === "deleted") return void (await ctx.reply("❌ این پیش‌بینی در دسترس نیست."));
    if (!canSubmitPrediction(contest)) return void (await ctx.reply("⏳ زمان ثبت پیش‌بینی به پایان رسیده است."));
    const option = await db.predictionOption.findUnique({
      where: { id: payload.optionId },
    });
    const confirmToken = createCallbackToken(ctx, "predictionPick", payload);
    await ctx.reply(
      `گزینه انتخابی شما: ${option?.title ?? "گزینه"}`,
      Markup.inlineKeyboard([
        [
          Markup.button.callback(
            "✅ ثبت نهایی پیش‌بینی",
            tokenAction("pr:c", confirmToken),
          ),
        ],
        [
          Markup.button.callback(
            "🔙 تغییر گزینه",
            callbackFor("prediction.detail", { contestId: payload.contestId }),
          ),
        ],
      ]),
    );
  });

  bot.action(/^pr:c:([^:]+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const payload = resolveCallbackToken(ctx, "predictionPick", ctx.match[1]);
    if (!payload || !ctx.from)
      return void (await ctx.reply("❌ درخواست معتبر نیست."));
    try {
      const user = await UserService.findOrCreateUser(ctx);
      await PredictionService.submitPrediction(
        payload.contestId,
        payload.optionId,
        { id: user.id, telegramId: String(ctx.from.id) },
      );
      deleteCallbackToken(ctx, ctx.match[1]);
      await ctx.reply("✅ پیش‌بینی شما ثبت شد.");
      await renderPanel(
        ctx,
        { id: "prediction.detail", params: { contestId: payload.contestId } },
        "replace",
      );
    } catch (error) {
      await ctx.reply(
        error instanceof Error ? error.message : "❌ ثبت پیش‌بینی انجام نشد.",
      );
    }
  });

  bot.action(/^pr:cl:([^:]+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (!ctx.from) return void (await ctx.reply("❌ درخواست معتبر نیست."));
    const tokenPayload = resolveCallbackToken(ctx, "predictionClaim", ctx.match[1]);
    const winnerId = tokenPayload?.winnerId ?? ctx.match[1];
    if (!tokenPayload && !/^[a-f\d]{24}$/i.test(winnerId)) {
      return void (await ctx.reply("برای دریافت جایزه، از بخش «جوایز من» اقدام کنید.", Markup.inlineKeyboard([[Markup.button.callback("🎁 جوایز من", callbackFor("account.rewards"))]])));
    }
    try {
      const result = await RewardService.claimPredictionReward(winnerId, String(ctx.from.id));
      if (result.rewardType === "product") {
        await ctx.reply(
          result.alreadyClaimed ? productRewardAlreadyClaimedMessage() : productRewardSuccessMessage(result.delivered!),
          Markup.inlineKeyboard(productRewardClaimKeyboard),
        );
      } else {
        await ctx.reply(result.alreadyClaimed ? "✅ این جایزه قبلاً دریافت شده است." : "🎁 جایزه شما با موفقیت دریافت شد.", Markup.inlineKeyboard([[Markup.button.callback("🎁 جوایز من", callbackFor("account.rewards"))]]));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "❌ دریافت جایزه انجام نشد. لطفاً با پشتیبانی تماس بگیرید.";
      const keyboard = message.includes("فعال‌سازی سرویس نیاز به بررسی")
        ? Markup.inlineKeyboard(productRewardFailedKeyboard)
        : undefined;
      await ctx.reply(message, keyboard);
    }
  });

  bot.action(/^reward:claim:prediction:([^:]+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (!ctx.from) return void (await ctx.reply("❌ درخواست معتبر نیست."));
    try {
      const result = await RewardService.claimPredictionReward(ctx.match[1], String(ctx.from.id));
      await ctx.reply(
        result.rewardType === "product"
          ? (result.alreadyClaimed ? productRewardAlreadyClaimedMessage() : productRewardSuccessMessage(result.delivered!))
          : (result.alreadyClaimed ? "✅ این جایزه قبلاً دریافت شده است." : "🎁 جایزه شما با موفقیت دریافت شد."),
        result.rewardType === "product" ? Markup.inlineKeyboard(productRewardClaimKeyboard) : undefined,
      );
      await renderPanel(ctx, { id: "account.rewards" }, "replace");
    } catch (error) {
      const message = error instanceof Error ? error.message : "❌ دریافت جایزه انجام نشد. لطفاً با پشتیبانی تماس بگیرید.";
      const keyboard = message.includes("فعال‌سازی سرویس نیاز به بررسی")
        ? Markup.inlineKeyboard(productRewardFailedKeyboard)
        : undefined;
      await ctx.reply(message, keyboard);
    }
  });

  bot.action("reward:claim:referral", async (ctx) => {
    await ctx.answerCbQuery();
    if (!ctx.from) return void (await ctx.reply("❌ درخواست معتبر نیست."));
    try {
      const user = await UserService.findOrCreateUser(ctx);
      const result = await RewardService.claimReferralRewards(user.id);
      await ctx.reply(`✅ ${result.amount.toLocaleString("fa-IR")} تومان پاداش دعوت دوستان به کیف پول شما اضافه شد.`);
      await renderPanel(ctx, { id: "account.rewards" }, "replace");
    } catch (error) {
      await ctx.reply(error instanceof Error ? error.message : "❌ دریافت جایزه انجام نشد.");
    }
  });

  bot.action(/^ap:res:([^:]+):([^:]+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id)))
      return void (await ctx.reply("دسترسی غیرمجاز"));
    await PredictionService.setResult(ctx.match[1], ctx.match[2], ctx.from.id);
    await ctx.reply(
      "✅ نتیجه تأیید و ثبت شد. پیش‌بینی‌های درست و نادرست مشخص شدند.",
    );
    await renderPanel(
      ctx,
      { id: "admin.predictionDetail", params: { contestId: ctx.match[1] } },
      "replace",
    );
  });

  bot.action(/^ap:win:([^:]+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return void (await ctx.reply("دسترسی غیرمجاز"));
    try {
      const before = await PredictionService.getWinnerSelectionPreview(ctx.match[1]);
      const winners = await PredictionService.selectPredictionWinners(ctx.match[1], ctx.from.id);
      const message = before.totalParticipants === 0
        ? "هیچ کاربری در این پیش‌بینی شرکت نکرده است."
        : before.correctPredictions === 0
          ? "هیچ پیش‌بینی درستی ثبت نشده است."
          : before.correctPredictions < before.winnerCount
            ? "تعداد پیش‌بینی‌های درست کمتر از تعداد برنده‌های تنظیم‌شده است؛ همه کاربران با پیش‌بینی درست به عنوان برنده انتخاب شدند."
            : `🏆 برنده‌ها انتخاب شدند.\nتعداد برنده‌ها: ${winners.length.toLocaleString("fa-IR")}`;
      await ctx.reply(message);
      await renderPanel(ctx, { id: "admin.predictionWinners", params: { contestId: ctx.match[1] } }, "replace");
    } catch (e) { await ctx.reply(e instanceof Error ? e.message : "❌ انتخاب برنده‌ها انجام نشد."); }
  });

  bot.action(/^ap:ann:([^:]+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return void (await ctx.reply("دسترسی غیرمجاز"));
    try {
      const result = await PredictionService.announcePredictionResults(ctx.match[1], ctx.from.id, async (telegramId, text, winner) => {
        const rows = winner
          ? PredictionService.winnerNotificationButtons().map((row) => row.map((button) => Markup.button.callback(button.text, callbackFor(button.view))))
          : [[Markup.button.callback(PredictionService.resultNotificationButton().text, callbackFor(PredictionService.resultNotificationButton().view))]];
        await ctx.telegram.sendMessage(telegramId, text, Markup.inlineKeyboard(rows));
      });
      const preview = await PredictionService.getWinnerSelectionPreview(ctx.match[1]);
      if (preview.totalParticipants === 0) await ctx.reply("✅ پیش‌بینی بدون شرکت‌کننده پایان یافت.");
      else await ctx.reply(`📣 گزارش اطلاع‌رسانی

🔮 پیش‌بینی:
${preview.contest.title}

👥 کل شرکت‌کنندگان: ${result.totalParticipants.toLocaleString("fa-IR")}
✅ پیش‌بینی درست: ${result.correctCount.toLocaleString("fa-IR")}
❌ پیش‌بینی اشتباه: ${result.wrongCount.toLocaleString("fa-IR")}
🏆 برنده‌ها: ${result.winnerCount.toLocaleString("fa-IR")}
📨 ارسال موفق: ${result.sent.toLocaleString("fa-IR")}
⚠️ ارسال ناموفق: ${result.failed.toLocaleString("fa-IR")}`, Markup.inlineKeyboard([[Markup.button.callback("🔙 جزئیات پیش‌بینی", callbackFor("admin.predictionDetail", { contestId: ctx.match[1] })), Markup.button.callback("🔮 مدیریت پیش‌بینی‌ها", callbackFor("admin.predictions"))]]));
      await renderPanel(ctx, { id: "admin.predictionWinners", params: { contestId: ctx.match[1] } }, "replace");
    } catch (e) { await ctx.reply(e instanceof Error ? e.message : "❌ اعلام نتایج انجام نشد."); }
  });

  bot.action(/^ap:close:([^:]+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    await db.predictionContest.update({
      where: { id: ctx.match[1] },
      data: { status: "closed" },
    });
    await renderPanel(
      ctx,
      { id: "admin.predictionDetail", params: { contestId: ctx.match[1] } },
      "replace",
    );
  });
  bot.action(/^ap:(?:arc|del):([^:]+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id)))
      return void (await ctx.reply("دسترسی غیرمجاز"));
    await renderPanel(
      ctx,
      {
        id: "admin.predictionDeleteConfirm",
        params: { contestId: ctx.match[1] },
      },
      "replace",
    );
  });
  bot.action(/^ap:arcc:([^:]+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id)))
      return void (await ctx.reply("دسترسی غیرمجاز"));
    await PredictionService.archivePrediction(ctx.match[1], ctx.from.id);
    await ctx.reply(
      "✅ پیش‌بینی آرشیو شد و دیگر برای کاربران نمایش داده نمی‌شود.",
    );
    await renderPanel(
      ctx,
      { id: "admin.predictionDetail", params: { contestId: ctx.match[1] } },
      "replace",
    );
  });
  bot.action(/^ap:delc:([^:]+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id)))
      return void (await ctx.reply("دسترسی غیرمجاز"));
    try {
      await PredictionService.hardDeletePrediction(ctx.match[1], ctx.from.id);
      await ctx.reply("✅ پیش‌بینی با موفقیت حذف شد.");
      await renderPanel(ctx, { id: "admin.predictions" }, "replace");
    } catch (error) {
      await PredictionService.archivePrediction(ctx.match[1], ctx.from.id);
      await ctx.reply(
        "✅ پیش‌بینی آرشیو شد و دیگر برای کاربران نمایش داده نمی‌شود.",
      );
      await renderPanel(
        ctx,
        { id: "admin.predictionDetail", params: { contestId: ctx.match[1] } },
        "replace",
      );
    }
  });
}
