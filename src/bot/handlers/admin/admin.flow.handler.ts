import type { AppContext } from "../../../types/bot";
import { CouponService } from "../../../modules/coupon/coupon.service";
import { ProductService } from "../../../modules/product/product.service";
import { AdminService } from "../../../modules/admin/admin.service";
import { resetFlow, getFlow } from "./admin.flow";
import { navigationKeyboard } from "../../keyboards/main.keyboard";

function asPositiveInteger(value: string): number | undefined {
  const number = Number(value.replace(/[,،]/g, ""));
  return Number.isInteger(number) && number > 0 ? number : undefined;
}

export async function handleAdminFlow(ctx: AppContext): Promise<boolean> {
  const flow = getFlow(ctx);
  if (!flow) return false;

  const text = ctx.message && "text" in ctx.message ? ctx.message.text.trim() : undefined;
  if (!text) return false;

  if (flow.flow === "product_create") {
    if (flow.step === "title") {
      flow.data.title = text;
      flow.step = "price";
      await ctx.reply("💰 قیمت محصول را به تومان ارسال کنید:", navigationKeyboard("admin:dashboard"));
      return true;
    }

    if (flow.step === "price") {
      const price = asPositiveInteger(text);
      if (!price) {
        await ctx.reply("❌ قیمت معتبر نیست. فقط عدد مثبت ارسال کنید.", navigationKeyboard("admin:dashboard"));
        return true;
      }
      flow.data.price = price;
      flow.step = "duration";
      await ctx.reply("⏳ مدت سرویس را به روز ارسال کنید:", navigationKeyboard("admin:dashboard"));
      return true;
    }

    if (flow.step === "duration") {
      const duration = asPositiveInteger(text);
      if (!duration) {
        await ctx.reply("❌ مدت معتبر نیست. فقط عدد مثبت ارسال کنید.", navigationKeyboard("admin:dashboard"));
        return true;
      }
      flow.data.duration = duration;
      flow.step = "category";
      await ctx.reply("📂 نام دسته‌بندی را ارسال کنید:", navigationKeyboard("admin:dashboard"));
      return true;
    }

    if (flow.step === "category") {
      const product = await ProductService.create({ categoryName: text, title: String(flow.data.title), price: Number(flow.data.price), duration: Number(flow.data.duration) });
      await AdminService.audit(String(ctx.from?.id ?? "system"), "product.create", { productId: product.id });
      resetFlow(ctx);
      await ctx.reply(`✅ محصول ${product.title} ساخته شد.`, navigationKeyboard("admin:dashboard"));
      return true;
    }
  }

  if (flow.flow === "coupon_create") {
    if (flow.step === "code") {
      flow.data.code = text;
      flow.step = "discount";
      await ctx.reply("📉 درصد تخفیف را ارسال کنید:", navigationKeyboard("admin:dashboard"));
      return true;
    }

    if (flow.step === "discount") {
      const discountPercent = asPositiveInteger(text);
      if (!discountPercent || discountPercent > 100) {
        await ctx.reply("❌ درصد تخفیف باید عددی بین ۱ تا ۱۰۰ باشد.", navigationKeyboard("admin:dashboard"));
        return true;
      }
      flow.data.discountPercent = discountPercent;
      flow.step = "maxUses";
      await ctx.reply("🔁 تعداد استفاده مجاز را ارسال کنید:", navigationKeyboard("admin:dashboard"));
      return true;
    }

    if (flow.step === "maxUses") {
      const maxUses = asPositiveInteger(text);
      if (!maxUses) {
        await ctx.reply("❌ تعداد استفاده معتبر نیست.", navigationKeyboard("admin:dashboard"));
        return true;
      }
      flow.data.maxUses = maxUses;
      flow.step = "days";
      await ctx.reply("📆 تعداد روزهای اعتبار را ارسال کنید:", navigationKeyboard("admin:dashboard"));
      return true;
    }

    if (flow.step === "days") {
      const days = asPositiveInteger(text);
      if (!days) {
        await ctx.reply("❌ تعداد روز معتبر نیست.", navigationKeyboard("admin:dashboard"));
        return true;
      }
      const coupon = await CouponService.create(String(flow.data.code), Number(flow.data.discountPercent), new Date(Date.now() + days * 86_400_000), Number(flow.data.maxUses));
      await AdminService.audit(String(ctx.from?.id ?? "system"), "coupon.create", { couponId: coupon.id, code: coupon.code });
      resetFlow(ctx);
      await ctx.reply(`✅ کوپن ${coupon.code} ساخته شد.`, navigationKeyboard("admin:dashboard"));
      return true;
    }
  }

  if (flow.flow === "account_create") {
    if (flow.step === "username") {
      flow.data.username = text;
      flow.step = "subscriptionLink";
      await ctx.reply("🔗 لینک ساب اکانت را ارسال کنید:", navigationKeyboard("admin:dashboard"));
      return true;
    }

    if (flow.step === "subscriptionLink") {
      flow.data.subscriptionLink = text;
      flow.step = "configLink";
      await ctx.reply("⚙️ لینک کانفیگ را ارسال کنید:", navigationKeyboard("admin:dashboard"));
      return true;
    }

    if (flow.step === "configLink") {
      const account = await ProductService.addAccount(String(flow.data.productId), { username: String(flow.data.username), subscriptionLink: String(flow.data.subscriptionLink), configLink: text });
      await AdminService.audit(String(ctx.from?.id ?? "system"), "product_account.create", { accountId: account.id, productId: flow.data.productId });
      resetFlow(ctx);
      await ctx.reply(`✅ اکانت ${account.username} اضافه شد.`, navigationKeyboard("admin:dashboard"));
      return true;
    }
  }

  return false;
}
