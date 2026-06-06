"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const bot_1 = require("../../bot");
const prisma_1 = require("../../../services/prisma");
const ADMINS = ["123456789"];
bot_1.bot.command("reply", async (ctx) => {
    if (!ADMINS.includes(String(ctx.from?.id)))
        return;
    const args = ctx.message.text.split(" ");
    const userId = args[1];
    const message = args.slice(2).join(" ");
    await prisma_1.prisma.ticketMessage.create({
        data: {
            ticketId: userId,
            senderId: "admin",
            message,
        },
    });
    await ctx.reply("✅ پیام ارسال شد");
});
