"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const bot_1 = require("../../bot");
const prisma_1 = require("../../../services/prisma");
const deposit_service_1 = require("../../../modules/deposit/deposit.service");
const WALLETS = {
    usdt: "TRC20_WALLET_ADDRESS",
    btc: "BTC_WALLET_ADDRESS",
};
bot_1.bot.action(/dep_(usdt|btc)_(\d+)/, async (ctx) => {
    const type = ctx.match[1];
    const amount = Number(ctx.match[2]);
    const user = await prisma_1.prisma.user.findUnique({
        where: {
            telegramId: String(ctx.from.id),
        },
    });
    if (!user) {
        await ctx.answerCbQuery();
        return ctx.reply("❌ کاربر یافت نشد");
    }
    const deposit = await deposit_service_1.DepositService.createDeposit(user.id, amount, type, WALLETS[type]);
    await ctx.answerCbQuery();
    await ctx.reply(`💰 درخواست شارژ ایجاد شد

💵 مبلغ: ${amount.toLocaleString()} تومان
💱 ارز: ${type.toUpperCase()}

📥 آدرس پرداخت:
${deposit.wallet}

⏳ شما ۳۰ دقیقه فرصت دارید
📤 پس از پرداخت رسید را ارسال کنید`);
});
