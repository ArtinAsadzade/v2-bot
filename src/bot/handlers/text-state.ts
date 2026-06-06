import type { AppContext } from "../../types/bot";
import { CouponService } from "../../modules/coupon/coupon.service";
import { ProductService } from "../../modules/product/product.service";
import { SupportService } from "../../modules/support/support.service";
import { UserService } from "../../modules/user/user.service";
import { currencyKeyboard } from "./deposit/start";
import { navigationKeyboard } from "../keyboards/main.keyboard";

export async function handleStateText(ctx: AppContext, next: () => Promise<void>) {
  const state = ctx.session.state;
  if (!state || !ctx.message || !("text" in ctx.message)) return next();

  const text = ctx.message.text.trim();

  switch (state.name) {
    case "deposit_amount": {
      const amount = Number(text.replace(/[,،]/g, ""));
      if (!Number.isInteger(amount) || amount <= 0) {
        await ctx.reply("❌ مبلغ معتبر وارد کنید.");
        return;
      }
      await ctx.reply("💱 ارز پرداخت را انتخاب کنید:", currencyKeyboard(amount));
      return;
    }
    case "deposit_receipt":
      await ctx.reply("لطفا تصویر رسید را ارسال کنید یا عملیات را لغو کنید.", navigationKeyboard());
      return;
    case "support_message": {
      const user = await UserService.findOrCreateUser(ctx);
      await SupportService.addUserMessage(state.ticketId, user.id, text);
      await ctx.reply("📩 پیام شما در تیکت ثبت شد. در صورت نیاز پیام بعدی را ارسال کنید یا لغو را بزنید.", navigationKeyboard());
      return;
    }
    case "coupon_code": {
      const user = await UserService.findOrCreateUser(ctx);
      try {
        const coupon = await CouponService.validateForUser(text, user.id);
        ctx.session.selectedCoupons = { ...(ctx.session.selectedCoupons ?? {}), [state.productId]: coupon.code };
        ctx.session.state = undefined;
        await ctx.reply(`✅ کد تخفیف ${coupon.discountPercent}% برای این خرید ثبت شد.`, navigationKeyboard(`product:${state.productId}`));
      } catch (error) {
        await ctx.reply(`❌ ${error instanceof Error ? error.message : "کد تخفیف معتبر نیست"}`, navigationKeyboard(`product:${state.productId}`));
      }
      return;
    }
    case "admin_coupon_create": {
      const [code, percentRaw, maxUsesRaw, daysRaw] = text.split(/\s+/);
      const percent = Number(percentRaw);
      const maxUses = Number(maxUsesRaw);
      const days = Number(daysRaw);
      if (!code || !Number.isInteger(percent) || !Number.isInteger(maxUses) || !Number.isInteger(days) || days <= 0) {
        await ctx.reply("فرمت کوپن معتبر نیست. نمونه: OFF20 20 10 7", navigationKeyboard("admin:dashboard"));
        return;
      }
      const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
      const coupon = await CouponService.create(code, percent, expiresAt, maxUses);
      ctx.session.state = undefined;
      await ctx.reply(`✅ کوپن ${coupon.code} ساخته شد.`, navigationKeyboard("admin:dashboard"));
      return;
    }
    case "admin_product_create": {
      const [categoryName, title, priceRaw, durationRaw] = text.split("|").map((part) => part.trim());
      const price = Number(priceRaw);
      const duration = Number(durationRaw);
      if (!categoryName || !title || !Number.isInteger(price) || price <= 0 || !Number.isInteger(duration) || duration <= 0) {
        await ctx.reply("فرمت محصول معتبر نیست. نمونه: VIP|VPN یک‌ماهه|50000|30", navigationKeyboard("admin:dashboard"));
        return;
      }
      const product = await ProductService.create({ categoryName, title, price, duration });
      ctx.session.state = undefined;
      await ctx.reply(`✅ محصول ${product.title} ساخته شد.`, navigationKeyboard("admin:dashboard"));
      return;
    }
    case "admin_account_create": {
      const [username, password, config] = text.split("|").map((part) => part.trim());
      if (!username || !password || !config) {
        await ctx.reply("فرمت اکانت معتبر نیست. نمونه: user|pass|config", navigationKeyboard("admin:dashboard"));
        return;
      }
      const account = await ProductService.addAccount(state.productId, { username, password, config });
      ctx.session.state = undefined;
      await ctx.reply(`✅ اکانت ${account.username} اضافه شد.`, navigationKeyboard("admin:dashboard"));
      return;
    }
    case "admin_ticket_reply": {
      const ticket = await SupportService.getTicketWithUser(state.ticketId);
      if (!ticket) {
        ctx.session.state = undefined;
        await ctx.reply("تیکت پیدا نشد.", navigationKeyboard("admin:tickets"));
        return;
      }
      await SupportService.addAdminReply(ticket.id, String(ctx.from?.id), text);
      await ctx.telegram.sendMessage(Number(ticket.user.telegramId), `📨 پاسخ پشتیبانی:\n\n${text}`);
      ctx.session.state = undefined;
      await ctx.reply("✅ پاسخ ارسال شد.", navigationKeyboard("admin:tickets"));
      return;
    }
  }
}
