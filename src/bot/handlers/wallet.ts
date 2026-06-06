import type { AppBot } from "../../types/bot";
import { UserService } from "../../modules/user/user.service";
import { navigationKeyboard } from "../keyboards/main.keyboard";

export function registerWalletHandlers(bot: AppBot) {
  bot.action("wallet", async (ctx) => {
    await ctx.answerCbQuery();
    const user = await UserService.findOrCreateUser(ctx);
    await ctx.reply(`💰 کیف پول شما:\n\nموجودی: ${user.balance.toLocaleString("fa-IR")} تومان`, navigationKeyboard());
  });
}
