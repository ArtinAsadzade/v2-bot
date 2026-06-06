"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerReferralHandlers = registerReferralHandlers;
const telegraf_1 = require("telegraf");
const referral_service_1 = require("../../modules/referral/referral.service");
const user_service_1 = require("../../modules/user/user.service");
const main_keyboard_1 = require("../keyboards/main.keyboard");
function registerReferralHandlers(bot) {
    bot.action("referral", async (ctx) => {
        await ctx.answerCbQuery();
        const user = await user_service_1.UserService.findOrCreateUser(ctx);
        const referralCode = await referral_service_1.ReferralService.ensureReferralCode(user.id, user.telegramId);
        const stats = await referral_service_1.ReferralService.getStats(user.id);
        const botUsername = ctx.botInfo?.username ?? process.env.BOT_USERNAME ?? "";
        const link = botUsername ? `https://t.me/${botUsername}?start=${referralCode}` : `کد دعوت: ${referralCode}`;
        await ctx.reply(`🎁 زیرمجموعه‌گیری\n\n🔗 لینک دعوت شما:\n${link}\n\n👥 تعداد دعوت‌ها: ${stats.totalReferrals.toLocaleString("fa-IR")}\n⏳ پاداش قابل برداشت: ${stats.pendingAmount.toLocaleString("fa-IR")} تومان\n✅ پاداش برداشت‌شده: ${stats.claimedAmount.toLocaleString("fa-IR")} تومان`, telegraf_1.Markup.inlineKeyboard([
            [telegraf_1.Markup.button.callback("💳 برداشت پاداش", "referral:claim")],
            [telegraf_1.Markup.button.callback("⬅️ بازگشت", "home")],
        ]));
    });
    bot.action("referral:claim", async (ctx) => {
        await ctx.answerCbQuery();
        const user = await user_service_1.UserService.findOrCreateUser(ctx);
        try {
            const result = await referral_service_1.ReferralService.claimPendingRewards(user.id);
            await ctx.reply(`✅ ${result.amount.toLocaleString("fa-IR")} تومان پاداش به کیف پول شما اضافه شد.`, (0, main_keyboard_1.navigationKeyboard)("referral"));
        }
        catch (error) {
            await ctx.reply(`❌ ${error instanceof Error ? error.message : "برداشت پاداش ناموفق بود"}`, (0, main_keyboard_1.navigationKeyboard)("referral"));
        }
    });
}
