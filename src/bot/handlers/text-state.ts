import type { AppContext } from "../../types/bot";
import { CouponService } from "../../modules/coupon/coupon.service";
import { SupportService } from "../../modules/support/support.service";
import { UserService } from "../../modules/user/user.service";
import { currencyKeyboard } from "./deposit/start";
import { navigationKeyboard } from "../keyboards/main.keyboard";
import { AdminService } from "../../modules/admin/admin.service";
import { ProductService } from "../../modules/product/product.service";
import { isValidObjectId } from "../../utils/object-id";

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
      try {
        await ctx.reply("💱 ارز پرداخت را انتخاب کنید:", await currencyKeyboard(amount));
      } catch (error) {
        await ctx.reply(`❌ ${error instanceof Error ? error.message : "مبلغ معتبر نیست"}`);
      }
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
        if (!isValidObjectId(state.productId)) throw new Error("برای استفاده از کد تخفیف، ابتدا یک سرویس را انتخاب کنید.");
        const product = await ProductService.getProduct(state.productId);
        if (!product) throw new Error("برای استفاده از کد تخفیف، ابتدا یک سرویس را انتخاب کنید.");
        const validation = await CouponService.validateForCheckout({ code: text, userId: user.id, originalAmount: product.price, productId: state.productId });
        if (!validation.ok) throw new Error(validation.reason);
        const coupon = validation.coupon;
        ctx.session.selectedCoupons = { ...(ctx.session.selectedCoupons ?? {}), [state.productId]: coupon.code };
        ctx.session.state = undefined;
        await ctx.reply(`✅ کد تخفیف ${coupon.type === "percentage" ? `${coupon.value || coupon.discountPercent || 0}%` : `${coupon.value.toLocaleString("fa-IR")} تومان`} برای این خرید ثبت شد.`, navigationKeyboard(`product:${state.productId}`));
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
    case "admin_category_search": {
      const [categories] = await AdminService.listCategories(1, 10, text);
      ctx.session.state = undefined;
      await ctx.reply(categories.map((category) => `📂 ${category.name} | ${category.isActive ? "فعال" : "غیرفعال"} | ترتیب ${category.displayOrder}`).join("\n") || "نتیجه‌ای پیدا نشد.", navigationKeyboard("admin:categories"));
      return;
    }
    case "admin_account_search": {
      const [accounts] = await AdminService.listAccounts(1, 10, text);
      ctx.session.state = undefined;
      await ctx.reply(accounts.map((account) => `👤 ${account.username} | ${account.product.title} | ${account.status}`).join("\n") || "نتیجه‌ای پیدا نشد.", navigationKeyboard("admin:accounts"));
      return;
    }
    case "admin_wallet_search": {
      const [wallets] = await AdminService.listCryptoWallets(1, 10, text);
      ctx.session.state = undefined;
      await ctx.reply(wallets.map((wallet) => `💳 ${wallet.displayName ?? wallet.coinName} | ${wallet.networkName} | ${wallet.status}`).join("\n") || "نتیجه‌ای پیدا نشد.", navigationKeyboard("admin:wallets"));
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
