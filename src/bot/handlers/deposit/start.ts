import { bot } from "../../bot";

bot.action("deposit", async (ctx) => {
  await ctx.answerCbQuery();

  await ctx.reply("💰 مقدار شارژ (تومان) را وارد کنید:");

  bot.once("text", async (ctx2) => {
    const amount = Number(ctx2.message.text);

    if (isNaN(amount)) {
      return ctx2.reply("❌ عدد معتبر وارد کنید");
    }

    await ctx2.reply("💱 انتخاب ارز:", {
      reply_markup: {
        inline_keyboard: [[{ text: "USDT (TRC20)", callback_data: `dep_usdt_${amount}` }], [{ text: "BTC", callback_data: `dep_btc_${amount}` }]],
      },
    });
  });
});
