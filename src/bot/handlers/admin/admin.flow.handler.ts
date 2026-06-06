import type { AppContext } from "../../../types/bot";
import { CouponService } from "../../../modules/coupon/coupon.service";
import { ProductService } from "../../../modules/product/product.service";
import { resetFlow, getFlow } from "./admin.flow";

export async function handleAdminFlow(ctx: AppContext) {
  const flow = getFlow(ctx);
  if (!flow) return false;

  const text = ctx.message && "text" in ctx.message ? ctx.message.text.trim() : undefined;
  if (!text) return false;

  if (flow.flow === "product_create") {
    if (flow.step === "title") {
      flow.data.title = text;
      flow.step = "price";
      await ctx.reply("💰 قیمت را ارسال کنید:");
      return true;
    }

    if (flow.step === "price") {
      const price = Number(text);
      if (!Number.isInteger(price) || price <= 0) {
        await ctx.reply("❌ قیمت معتبر نیست.");
        return true;
      }
      flow.data.price = price;
      flow.step = "category";
      await ctx.reply("📂 نام دسته‌بندی را ارسال کنید:");
      return true;
    }

    if (flow.step === "category") {
      const product = await ProductService.create({ categoryName: text, title: String(flow.data.title), price: Number(flow.data.price), duration: Number(flow.data.duration ?? 30) });
      resetFlow(ctx);
      await ctx.reply(`✅ محصول ${product.title} ساخته شد.`);
      return true;
    }
  }

  if (flow.flow === "coupon_create") {
    if (flow.step === "code") {
      flow.data.code = text;
      flow.step = "discount";
      await ctx.reply("📉 درصد تخفیف را ارسال کنید:");
      return true;
    }

    if (flow.step === "discount") {
      flow.data.discountPercent = Number(text);
      flow.step = "maxUses";
      await ctx.reply("🔁 تعداد استفاده مجاز را ارسال کنید:");
      return true;
    }

    if (flow.step === "maxUses") {
      flow.data.maxUses = Number(text);
      flow.step = "days";
      await ctx.reply("📆 تعداد روزهای اعتبار را ارسال کنید:");
      return true;
    }

    if (flow.step === "days") {
      const days = Number(text);
      const coupon = await CouponService.create(String(flow.data.code), Number(flow.data.discountPercent), new Date(Date.now() + days * 86_400_000), Number(flow.data.maxUses));
      resetFlow(ctx);
      await ctx.reply(`✅ کوپن ${coupon.code} ساخته شد.`);
      return true;
    }
  }

  if (flow.flow === "account_create") {
    const [username, password, config] = text.split("|").map((part) => part.trim());
    if (!username || !password || !config) {
      await ctx.reply("فرمت اکانت معتبر نیست. نمونه: نام‌کاربری|رمزعبور|کانفیگ");
      return true;
    }
    await ProductService.addAccount(String(flow.data.productId), { username, password, config });
    resetFlow(ctx);
    await ctx.reply("✅ اکانت اضافه شد.");
    return true;
  }

  return false;
}
