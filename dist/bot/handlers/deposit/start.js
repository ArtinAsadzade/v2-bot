"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerDepositHandlers = registerDepositHandlers;
exports.currencyKeyboard = currencyKeyboard;
const telegraf_1 = require("telegraf");
const deposit_service_1 = require("../../../modules/deposit/deposit.service");
const user_service_1 = require("../../../modules/user/user.service");
const main_keyboard_1 = require("../../keyboards/main.keyboard");
function registerDepositHandlers(bot) {
    bot.action("deposit", async (ctx) => {
        await ctx.answerCbQuery();
        ctx.session.state = { name: "deposit_amount" };
        await ctx.reply("💰 مبلغ شارژ را به تومان وارد کنید:", (0, main_keyboard_1.navigationKeyboard)());
    });
    bot.action(/^dep:(usdt|btc):(\d+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        const currency = ctx.match[1];
        if (!(0, deposit_service_1.isDepositCurrency)(currency)) {
            await ctx.reply("ارز انتخابی معتبر نیست.", (0, main_keyboard_1.navigationKeyboard)());
            return;
        }
        const amount = Number(ctx.match[2]);
        const user = await user_service_1.UserService.findOrCreateUser(ctx);
        const deposit = await deposit_service_1.DepositService.createDeposit(user.id, amount, currency);
        ctx.session.state = { name: "deposit_receipt", depositId: deposit.id };
        await ctx.reply(`💰 درخواست شارژ ایجاد شد\n\n💵 مبلغ: ${amount.toLocaleString("fa-IR")} تومان\n💱 ارز: ${currency.toUpperCase()}\n\n📥 آدرس پرداخت:\n${deposit.wallet}\n\n⏳ مهلت پرداخت: ۳۰ دقیقه\n📤 پس از پرداخت، تصویر رسید را همینجا ارسال کنید.`, (0, main_keyboard_1.navigationKeyboard)());
    });
    bot.on("photo", async (ctx, next) => {
        if (ctx.session.state?.name !== "deposit_receipt")
            return next();
        const user = await user_service_1.UserService.findOrCreateUser(ctx);
        const photos = ctx.message.photo;
        const fileId = photos[photos.length - 1]?.file_id;
        if (!fileId) {
            await ctx.reply("رسید معتبر نیست. لطفا تصویر رسید را ارسال کنید.");
            return;
        }
        try {
            await deposit_service_1.DepositService.submitReceipt(ctx.session.state.depositId, user.id, fileId);
            ctx.session.state = undefined;
            await ctx.reply("⏳ رسید شما ثبت شد و در انتظار تایید ادمین است.", (0, main_keyboard_1.navigationKeyboard)());
        }
        catch (error) {
            await ctx.reply(`❌ ${error instanceof Error ? error.message : "ثبت رسید ناموفق بود"}`, (0, main_keyboard_1.navigationKeyboard)());
        }
    });
}
function currencyKeyboard(amount) {
    return telegraf_1.Markup.inlineKeyboard([
        [telegraf_1.Markup.button.callback("USDT (TRC20)", `dep:usdt:${amount}`)],
        [telegraf_1.Markup.button.callback("BTC", `dep:btc:${amount}`)],
        [telegraf_1.Markup.button.callback("⬅️ بازگشت", "deposit"), telegraf_1.Markup.button.callback("❌ لغو", "cancel")],
    ]);
}
