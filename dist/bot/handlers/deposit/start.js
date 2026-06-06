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
        const setting = await deposit_service_1.FinancialSettingsService.get();
        await ctx.reply(`💰 مبلغ شارژ را به تومان وارد کنید:\n\nحداقل شارژ: ${setting.minimumTopupAmount.toLocaleString("fa-IR")} تومان`, (0, main_keyboard_1.navigationKeyboard)());
    });
    bot.action(/^dep:wallet:([^:]+):(\d+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        const walletId = ctx.match[1];
        const amount = Number(ctx.match[2]);
        const user = await user_service_1.UserService.findOrCreateUser(ctx);
        try {
            const quote = await deposit_service_1.CryptoWalletService.quote(walletId, amount);
            const deposit = await deposit_service_1.DepositService.createDeposit(user.id, amount, walletId);
            ctx.session.state = { name: "deposit_receipt", depositId: deposit.id };
            await ctx.reply(`💰 درخواست شارژ ایجاد شد\n\nمبلغ شارژ:\n${amount.toLocaleString("fa-IR")} تومان\n\nرمز ارز:\n${quote.wallet.coinName}\n\nشبکه:\n${quote.wallet.networkName}\n\nنرخ:\n${quote.exchangeRate.toLocaleString("fa-IR")} تومان\n\nمبلغ قابل پرداخت:\n${quote.cryptoAmount.toLocaleString("fa-IR", { maximumFractionDigits: 8 })} ${quote.wallet.coinName}\n\nآدرس کیف پول:\n${quote.wallet.walletAddress}\n\n⏳ مهلت پرداخت: ۳۰ دقیقه\n📤 پس از پرداخت، تصویر رسید را همینجا ارسال کنید.`, (0, main_keyboard_1.navigationKeyboard)());
        }
        catch (error) {
            await ctx.reply(`❌ ${error instanceof Error ? error.message : "ایجاد درخواست شارژ ناموفق بود"}`, (0, main_keyboard_1.navigationKeyboard)());
        }
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
async function currencyKeyboard(amount) {
    const wallets = await deposit_service_1.CryptoWalletService.listActive();
    return telegraf_1.Markup.inlineKeyboard([
        ...wallets.map((wallet) => [telegraf_1.Markup.button.callback(`${wallet.coinName} ${wallet.networkName}`, `dep:wallet:${wallet.id}:${amount}`)]),
        [telegraf_1.Markup.button.callback("⬅️ بازگشت", "deposit"), telegraf_1.Markup.button.callback("❌ لغو", "cancel")],
    ]);
}
