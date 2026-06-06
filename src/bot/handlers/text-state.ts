import type { AppContext } from "../../types/bot";
import { CouponService } from "../../modules/coupon/coupon.service";
import { SupportService } from "../../modules/support/support.service";
import { UserService } from "../../modules/user/user.service";
import { currencyKeyboard } from "./deposit/start";
import { navigationKeyboard } from "../keyboards/main.keyboard";
import { AdminService } from "../../modules/admin/admin.service";

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
    case "admin_user_search": {
      const query = text.replace(/^@/, "");
      const users = await AdminService.searchUsers(query);
      ctx.session.state = undefined;
      await ctx.reply(
        users.map((user) => `👤 ${user.telegramId} @${user.username ?? "-"} | ${user.balance.toLocaleString("fa-IR")} تومان`).join("\n") || "نتیجه‌ای پیدا نشد.",
        navigationKeyboard("admin:users"),
      );
      return;
    }
    case "admin_product_search": {
      const products = await AdminService.searchProducts(text);
      const lines = products.map((product) => `📦 ${product.title} | ${product.category.name} | ${product.price.toLocaleString("fa-IR")} تومان`);
      ctx.session.state = undefined;
      await ctx.reply(lines.join("\n") || "نتیجه‌ای پیدا نشد.", navigationKeyboard("admin:products"));
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
      ctx.session.state = undefined;
      await ctx.reply("✅ پاسخ ارسال شد.", navigationKeyboard("admin:tickets"));
      return;
    }
  }
}
