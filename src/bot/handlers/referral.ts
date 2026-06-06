import { Markup } from "telegraf";
import type { AppBot } from "../../types/bot";
import { ReferralService } from "../../modules/referral/referral.service";
import { UserService } from "../../modules/user/user.service";
import { navigationKeyboard } from "../keyboards/main.keyboard";

export function registerReferralHandlers(bot: AppBot) {
  bot.action("referral", async (ctx) => {
    await ctx.answerCbQuery();
    const user = await UserService.findOrCreateUser(ctx);
    const referralCode = await ReferralService.ensureReferralCode(user.id, user.telegramId);
    const stats = await ReferralService.getStats(user.id);
    const botUsername = ctx.botInfo?.username ?? process.env.BOT_USERNAME ?? "";
    const link = botUsername ? `https://t.me/${botUsername}?start=${referralCode}` : `کد دعوت: ${referralCode}`;

    await ctx.reply(
      `🎁 زیرمجموعه‌گیری\n\n🔗 لینک دعوت شما:\n${link}\n\n👥 تعداد دعوت‌ها: ${stats.totalReferrals.toLocaleString("fa-IR")}\n⏳ پاداش قابل برداشت: ${stats.pendingAmount.toLocaleString("fa-IR")} تومان\n✅ پاداش برداشت‌شده: ${stats.claimedAmount.toLocaleString("fa-IR")} تومان`,
      Markup.inlineKeyboard([
        [Markup.button.callback("💳 برداشت پاداش", "referral:claim")],
        [Markup.button.callback("⬅️ بازگشت", "home")],
      ]),
    );
  });

  bot.action("referral:claim", async (ctx) => {
    await ctx.answerCbQuery();
    const user = await UserService.findOrCreateUser(ctx);
    try {
      const result = await ReferralService.claimPendingRewards(user.id);
      await ctx.reply(`✅ ${result.amount.toLocaleString("fa-IR")} تومان پاداش به کیف پول شما اضافه شد.`, navigationKeyboard("referral"));
    } catch (error) {
      await ctx.reply(`❌ ${error instanceof Error ? error.message : "برداشت پاداش ناموفق بود"}`, navigationKeyboard("referral"));
    }
  });
}
