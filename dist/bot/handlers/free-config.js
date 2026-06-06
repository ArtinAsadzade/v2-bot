"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerFreeConfigHandlers = registerFreeConfigHandlers;
const telegraf_1 = require("telegraf");
const free_config_service_1 = require("../../modules/rewards/free-config.service");
const user_service_1 = require("../../modules/user/user.service");
const main_keyboard_1 = require("../keyboards/main.keyboard");
function registerFreeConfigHandlers(bot) {
    bot.action("free_config", async (ctx) => {
        await ctx.answerCbQuery();
        const user = await user_service_1.UserService.findOrCreateUser(ctx);
        const status = await free_config_service_1.FreeConfigService.getStatus(user.id);
        const ready = Boolean(status.reward);
        await ctx.reply(`🆓 کانفیگ رایگان\n\nبرای دریافت کانفیگ رایگان باید ${status.requiredReferrals.toLocaleString("fa-IR")} کاربر دعوت کنید.\n\nدعوت‌های شما: ${status.referralCount.toLocaleString("fa-IR")}\nوضعیت: ${ready ? "آماده دریافت ✅" : "در انتظار تکمیل ⏳"}`, telegraf_1.Markup.inlineKeyboard([
            [telegraf_1.Markup.button.callback("🎁 دریافت کانفیگ", "free_config:claim")],
            [telegraf_1.Markup.button.callback("🔗 لینک دعوت", "referral")],
            [telegraf_1.Markup.button.callback("⬅️ بازگشت", "home")],
        ]));
    });
    bot.action("free_config:claim", async (ctx) => {
        await ctx.answerCbQuery();
        const user = await user_service_1.UserService.findOrCreateUser(ctx);
        try {
            const reward = await free_config_service_1.FreeConfigService.claim(user.id);
            await ctx.reply(`✅ کانفیگ رایگان شما:\n\n${reward.config}`, (0, main_keyboard_1.navigationKeyboard)("home"));
        }
        catch (error) {
            await ctx.reply(`❌ ${error instanceof Error ? error.message : "دریافت کانفیگ ناموفق بود"}`, (0, main_keyboard_1.navigationKeyboard)("free_config"));
        }
    });
}
