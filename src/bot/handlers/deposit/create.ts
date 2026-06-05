import { bot } from "../../bot";
import { prisma } from "../../../services/prisma";
import { DepositService } from "../../../modules/deposit/deposit.service";

const WALLETS: Record<"usdt" | "btc", string> = {
  usdt: "TRC20_WALLET_ADDRESS",
  btc: "BTC_WALLET_ADDRESS",
};

bot.action(/dep_(usdt|btc)_(\d+)/, async (ctx) => {
  const type = ctx.match[1] as "usdt" | "btc";
  const amount = Number(ctx.match[2]);

  const user = await prisma.user.findUnique({
    where: {
      telegramId: String(ctx.from.id),
    },
  });

  if (!user) {
    await ctx.answerCbQuery();
    return ctx.reply("❌ کاربر یافت نشد");
  }

  const deposit = await DepositService.createDeposit(user.id, amount, type, WALLETS[type]);

  await ctx.answerCbQuery();

  await ctx.reply(
    `💰 درخواست شارژ ایجاد شد

💵 مبلغ: ${amount.toLocaleString()} تومان
💱 ارز: ${type.toUpperCase()}

📥 آدرس پرداخت:
${deposit.wallet}

⏳ شما ۳۰ دقیقه فرصت دارید
📤 پس از پرداخت رسید را ارسال کنید`,
  );
});
