import { bot } from "../bot";
import { UserService } from "../../modules/user/user.service";
import { MESSAGES } from "../../utils/messages";

bot.start(async (ctx) => {
  const user = await UserService.findOrCreateUser(ctx);

  await ctx.reply(MESSAGES.WELCOME, {
    reply_markup: {
      inline_keyboard: [
        [{ text: "💰 کیف پول", callback_data: "wallet" }],
        [{ text: "🛒 خرید سرویس", callback_data: "shop" }],
        [{ text: "🎧 پشتیبانی", callback_data: "support" }],
      ],
    },
  });
});
