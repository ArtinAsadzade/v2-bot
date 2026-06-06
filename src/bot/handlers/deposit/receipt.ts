import { bot } from "../../bot";
import { prisma } from "../../../services/prisma";

bot.on("photo", async (ctx) => {
  const user = await prisma.user.findUnique({
    where: {
      telegramId: String(ctx.from.id),
    },
  });

  if (!user) {
    return ctx.reply("❌ کاربر یافت نشد");
  }

  const deposit = await prisma.deposit.findFirst({
    where: {
      userId: user.id,
      status: "pending",
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  if (!deposit) {
    return ctx.reply("❌ درخواست شارژ فعالی پیدا نشد");
  }

  const photos = ctx.message.photo;
  const fileId = photos[photos.length - 1].file_id;

  await prisma.deposit.update({
    where: {
      id: deposit.id,
    },
    data: {
      receipt: fileId,
      status: "submitted",
    },
  });

  await ctx.reply("⏳ رسید شما ثبت شد و در انتظار تایید ادمین است.");
});
