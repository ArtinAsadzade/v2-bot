import { bot } from "../bot";
import { prisma } from "../../services/prisma";

bot.action("wallet", async (ctx) => {
  const user = await prisma.user.findUnique({
    where: { telegramId: String(ctx.from?.id) },
  });

  await ctx.answerCbQuery();

  await ctx.reply(
    `💰 کیف پول شما:
    
موجودی: ${user?.balance || 0} تومان`,
  );
});
