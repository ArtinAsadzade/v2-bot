import { bot } from "../bot";
import { prisma } from "../../services/prisma";

bot.action("shop", async (ctx) => {
  const products = await prisma.product.findMany();

  const buttons = products.map((p) => [{ text: `🛒 ${p.title} - ${p.price} تومان`, callback_data: `buy_${p.id}` }]);

  await ctx.answerCbQuery();

  await ctx.reply("🛍 لیست سرویس‌ها:", {
    reply_markup: {
      inline_keyboard: buttons,
    },
  });
});
