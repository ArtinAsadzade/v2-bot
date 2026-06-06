import type { AppBot } from "../../../types/bot";
import { SupportService } from "../../../modules/support/support.service";
import { UserService } from "../../../modules/user/user.service";
import { handleStateText } from "../text-state";
import { navigationKeyboard } from "../../keyboards/main.keyboard";

export function registerSupportHandlers(bot: AppBot) {
  bot.action("support", async (ctx) => {
    await ctx.answerCbQuery();
    const user = await UserService.findOrCreateUser(ctx);
    const ticket = await SupportService.createTicket(user.id);
    ctx.session.state = { name: "support_message", ticketId: ticket.id };
    await ctx.reply(`🎧 تیکت پشتیبانی ایجاد شد.\nشناسه تیکت: ${ticket.id}\n\nپیام خود را ارسال کنید:`, navigationKeyboard());
  });

  bot.on("text", handleStateText);
}
