import { bot } from "../../bot";

const ADMINS = ["123456789"];

bot.command("admin", async (ctx) => {
  if (!ADMINS.includes(String(ctx.from?.id))) return;

  await ctx.reply(`
👨‍💼 پنل مدیریت:

/users - لیست کاربران
/tickets - تیکت‌ها
/coupons - کدهای تخفیف
/addcoupon CODE DISCOUNT
  `);
});
