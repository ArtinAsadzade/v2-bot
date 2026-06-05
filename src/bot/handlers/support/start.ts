import { bot } from "../../bot";
import { prisma } from "../../../services/prisma";

bot.action("support", async (ctx) => {
  await ctx.answerCbQuery();

  const user = await prisma.user.findUnique({
    where: { telegramId: String(ctx.from?.id) },
  });

  const ticket = await prisma.ticket.create({
    data: {
      userId: user!.id,
      status: "open",
    },
  });

  await ctx.reply("🎧 تیکت پشتیبانی ایجاد شد. پیام خود را ارسال کنید.");
});
