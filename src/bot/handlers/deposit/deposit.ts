import { bot } from "../../bot";
import { DepositService } from "../../../modules/deposit/deposit.service";

const CRYPTO_WALLETS = {
  USDT: "TRC20-WALLET-ADDRESS",
  BTC: "BTC-WALLET-ADDRESS",
};

bot.action("deposit", async (ctx) => {
  await ctx.answerCbQuery();

  await ctx.reply("💰 مبلغ شارژ (تومان) را وارد کنید:");

  bot.on("text", async (msgCtx) => {
    const amount = Number(msgCtx.message.text);
    if (isNaN(amount)) return;

    await msgCtx.reply("💱 انتخاب ارز:", {
      reply_markup: {
        inline_keyboard: [[{ text: "USDT (TRC20)", callback_data: `dep_usdt_${amount}` }], [{ text: "BTC", callback_data: `dep_btc_${amount}` }]],
      },
    });
  });
});
