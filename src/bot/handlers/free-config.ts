import { Markup } from "telegraf";
import type { AppBot } from "../../types/bot";
import { FreeConfigService } from "../../modules/rewards/free-config.service";
import { UserService } from "../../modules/user/user.service";
import { navigationKeyboard } from "../keyboards/main.keyboard";

export function registerFreeConfigHandlers(bot: AppBot) {
  bot.action("free_config", async (ctx) => {
    await ctx.answerCbQuery();
    const user = await UserService.findOrCreateUser(ctx);
    const status = await FreeConfigService.getStatus(user.id);
    const ready = Boolean(status.reward);
    await ctx.reply(
      `🆓 کانفیگ رایگان\n\nبرای دریافت کانفیگ رایگان باید ${status.requiredReferrals.toLocaleString("fa-IR")} کاربر دعوت کنید.\n\nدعوت‌های شما: ${status.referralCount.toLocaleString("fa-IR")}\nوضعیت: ${ready ? "آماده دریافت ✅" : "در انتظار تکمیل ⏳"}`,
      Markup.inlineKeyboard([
        [Markup.button.callback("🎁 دریافت کانفیگ", "free_config:claim")],
        [Markup.button.callback("🔗 لینک دعوت", "referral")],
        [Markup.button.callback("⬅️ بازگشت", "home")],
      ]),
    );
  });

  bot.action("free_config:claim", async (ctx) => {
    await ctx.answerCbQuery();
    const user = await UserService.findOrCreateUser(ctx);
    try {
      const reward = await FreeConfigService.claim(user.id);
      await ctx.reply(`✅ کانفیگ رایگان شما:\n\n${reward.config}`, navigationKeyboard("home"));
    } catch (error) {
      await ctx.reply(`❌ ${error instanceof Error ? error.message : "دریافت کانفیگ ناموفق بود"}`, navigationKeyboard("free_config"));
    }
  });
}
