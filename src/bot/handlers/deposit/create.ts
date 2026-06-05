import { bot } from "../../bot";
import { prisma } from "../../../services/prisma";
import { DepositService } from "../../../modules/deposit/deposit.service";

const WALLETS = {
  usdt: "TRC20_WALLET_ADDRESS",
  btc: "BTC_WALLET_ADDRESS",
};

bot.action(/dep_(usdt|btc)_(\d+)/, async (ctx) => {
  const type = ctx.match[1];
  const amount = Number(ctx.match[2]);

  const user = await prisma.user.findUnique({
    where: { telegramId: String(ctx.from?.id) },
  });

  const deposit = await DepositService.createDeposit(user!.id, amount, type, WALLETS[type]);

  await ctx.answerCbQuery();

  await ctx.reply(`
💰 درخواست شارژ ایجاد شد

💵 مبلغ: ${amount} تومان
💱 ارز: ${type.toUpperCase()}

📥 آدرس پرداخت:
${deposit.wallet}

⏳ شما ۳۰ دقیقه فرصت دارید
📤 بعد از پرداخت، رسید ارسال کنید
  `);
});
