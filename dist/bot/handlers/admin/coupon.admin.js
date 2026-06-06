"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const bot_1 = require("../../bot");
const coupon_service_1 = require("../../../modules/coupon/coupon.service");
bot_1.bot.command("addcoupon", async (ctx) => {
    const args = ctx.message.text.split(" ");
    const code = args[1];
    const discount = Number(args[2]);
    const expires = new Date();
    expires.setDate(expires.getDate() + 7);
    await coupon_service_1.CouponService.create(code, discount, expires);
    await ctx.reply("🎟 کد تخفیف ساخته شد");
});
