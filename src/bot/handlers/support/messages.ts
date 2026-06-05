import { bot } from "../../bot";
import { prisma } from "../../../services/prisma";

bot.on("text", async (ctx, next) => {
  const user = await prisma.user.findUnique({
    where: {
      telegramId: String(ctx.from.id),
    },
  });

  if (!user) {
    return next();
  }

  const ticket = await prisma.ticket.findFirst({
    where: {
      userId: user.id,
      status: "open",
    },
  });

  if (!ticket) {
    return next();
  }

  await prisma.ticketMessage.create({
    data: {
      ticketId: ticket.id,
      senderId: user.id,
      message: ctx.message.text,
    },
  });

  await ctx.reply("📩 پیام شما برای پشتیبانی ارسال شد");
});
