import { bot } from "../../bot";
import { prisma } from "../../../services/prisma";

bot.on("photo", async (ctx) => {
  const user = await prisma.user.findUnique({
    where: { telegramId: String(ctx.from?.id) },
  });

  const deposit = await prisma.deposit.findFirst({
    where: {
      userId: user!.id,
      status: "pending",
    },
    orderBy: { createdAt: "desc" },
  });

  if (!deposit) return;

  const fileId = ctx.message.photo.at(-1)!.file_id;

  await prisma.deposit.update({
    where: { id: deposit.id },
    data: {
      receipt: fileId,
      status: "submitted",
    },
  });

  await ctx.reply("⏳ رسید ارسال شد و در انتظار تایید ادمین است.");
});
