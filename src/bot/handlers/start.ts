import type { AppBot, AppContext } from "../../types/bot";
import { UserService } from "../../modules/user/user.service";
import { MESSAGES } from "../../utils/messages";
import { homeKeyboard } from "../keyboards/main.keyboard";
import { isAdminByTelegramId } from "../middlewares/admin.middleware";

export async function showHome(ctx: AppContext) {
  if (!ctx.from) return;
  const isAdmin = await isAdminByTelegramId(ctx.from.id);
  await ctx.reply(MESSAGES.HOME, homeKeyboard(isAdmin));
}

export function registerStartHandlers(bot: AppBot) {
  bot.start(async (ctx) => {
    if (!ctx.from) return;
    await UserService.findOrCreateUser(ctx);
    await ctx.reply(MESSAGES.WELCOME, homeKeyboard(await isAdminByTelegramId(ctx.from.id)));
  });

  bot.action("home", async (ctx) => {
    ctx.session.state = undefined;
    await ctx.answerCbQuery();
    await showHome(ctx);
  });

  bot.action("cancel", async (ctx) => {
    ctx.session.state = undefined;
    await ctx.answerCbQuery("لغو شد");
    await ctx.reply(MESSAGES.CANCELLED, homeKeyboard(await isAdminByTelegramId(ctx.from.id)));
  });
}
