"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const bot_1 = require("../../bot");
const ADMINS = ["123456789"];
bot_1.bot.command("admin", async (ctx) => {
    if (!ADMINS.includes(String(ctx.from?.id)))
        return;
    await ctx.reply(`
👨‍💼 پنل مدیریت:

/users - لیست کاربران
/tickets - تیکت‌ها
/coupons - کدهای تخفیف
/addcoupon CODE DISCOUNT
  `);
});
