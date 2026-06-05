import { bot } from "../../bot";
import { CouponService } from "../../../modules/coupon/coupon.service";

bot.command("addcoupon", async (ctx) => {
  const args = ctx.message.text.split(" ");
  const code = args[1];
  const discount = Number(args[2]);

  const expires = new Date();
  expires.setDate(expires.getDate() + 7);

  await CouponService.create(code, discount, expires);

  await ctx.reply("🎟 کد تخفیف ساخته شد");
});
