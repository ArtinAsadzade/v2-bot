import { bot } from "../../bot";
import { prisma } from "../../../services/prisma";

const ADMINS = ["123456789"];

bot.command("reply", async (ctx) => {
  if (!ADMINS.includes(String(ctx.from?.id))) return;

  const args = ctx.message.text.split(" ");
  const userId = args[1];
  const message = args.slice(2).join(" ");

  await prisma.ticketMessage.create({
    data: {
      ticketId: userId,
      senderId: "admin",
      message,
    },
  });

  await ctx.reply("✅ پیام ارسال شد");
});
