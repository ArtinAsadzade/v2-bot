import type { AppBot } from "../../types/bot";
import { registerModernViews } from "../views/modern.views";
import { goBack, parseNavAction, renderPanel, callbackFor } from "../navigation/panel-ui";
import { registerFlowEngine, handleActiveFlowPhoto, handleActiveFlowText } from "../flows/flow-engine";
import { UserService } from "../../modules/user/user.service";
import { ReferralService } from "../../modules/referral/referral.service";
import { PurchaseService } from "../../modules/product/purchase.service";
import { DepositService } from "../../modules/deposit/deposit.service";
import { AdminService } from "../../modules/admin/admin.service";
import { SupportService } from "../../modules/support/support.service";
import { registerFreeAccountEvents } from "../../modules/free-account/free-account.service";
import { isAdminByTelegramId } from "../middlewares/admin.middleware";


export function registerModernHandlers(bot: AppBot) {
  registerModernViews();
  registerFlowEngine(bot);
  registerFreeAccountEvents();

  bot.start(async (ctx) => {
    if (!ctx.from) return;
    const user = await UserService.findOrCreateUser(ctx);
    const payload = ctx.startPayload;
    if (payload) await ReferralService.linkReferral(user.id, payload);
    await renderPanel(ctx, { id: "home" }, "replace");
  });

  bot.action(/^nav:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (ctx.match[1] === "back") return goBack(ctx);
    const state = parseNavAction(`nav:${ctx.match[1]}`);
    if (!state) return;
    if (state.id.startsWith("admin") && (!ctx.from || !(await isAdminByTelegramId(ctx.from.id)))) {
      await ctx.answerCbQuery("دسترسی غیرمجاز");
      return;
    }
    await renderPanel(ctx, state, "push");
  });

  bot.action(/^buy:confirm:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (!ctx.from) return;
    const user = await UserService.getByTelegramId(ctx.from.id);
    if (!user) return;
    try {
      const productId = ctx.match[1];
      const coupon = ctx.session.selectedCoupons?.[productId];
      const result = await PurchaseService.buyProduct(user.id, productId, coupon);
      delete ctx.session.selectedCoupons?.[productId];
      await ctx.editMessageText(`✅ خرید با موفقیت انجام شد.\n\nمحصول: ${result.product.title}\nمبلغ پرداختی: ${result.totalAmount.toLocaleString("fa-IR")} تومان\n\nنام کاربری: ${result.account.username}\nرمز عبور: ${result.account.password}\nکانفیگ:\n${result.account.config}`, { reply_markup: { inline_keyboard: [[{ text: "🏠 خانه", callback_data: callbackFor("home") }]] } });
    } catch (error) {
      await ctx.editMessageText(`❌ ${error instanceof Error ? error.message : "خرید ناموفق بود"}`, { reply_markup: { inline_keyboard: [[{ text: "⬅️ بازگشت", callback_data: "nav:back" }, { text: "🏠 خانه", callback_data: callbackFor("home") }]] } });
    }
  });

  bot.action("referral:claim", async (ctx) => {
    await ctx.answerCbQuery();
    if (!ctx.from) return;
    const user = await UserService.getByTelegramId(ctx.from.id);
    if (!user) return;
    try {
      const result = await ReferralService.claimPendingRewards(user.id);
      await ctx.answerCbQuery(`برداشت شد: ${result.amount.toLocaleString("fa-IR")} تومان`);
    } catch (error) {
      await ctx.answerCbQuery(error instanceof Error ? error.message : "برداشت ناموفق بود");
    }
    await renderPanel(ctx, { id: "referral" }, "replace");
  });

  bot.action(/^admin:user:ban:([^:]+):([01])$/, async (ctx) => {
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return ctx.answerCbQuery("دسترسی غیرمجاز");
    await ctx.answerCbQuery();
    await AdminService.setUserBan(ctx.match[1], ctx.match[2] === "1", String(ctx.from.id));
    await renderPanel(ctx, { id: "admin.user", params: { userId: ctx.match[1] } }, "replace");
  });

  bot.action(/^admin:product:active:([^:]+):([01])$/, async (ctx) => {
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return ctx.answerCbQuery("دسترسی غیرمجاز");
    await ctx.answerCbQuery();
    await AdminService.setProductActive(ctx.match[1], ctx.match[2] === "1", String(ctx.from.id));
    await renderPanel(ctx, { id: "admin.product", params: { productId: ctx.match[1] } }, "replace");
  });

  bot.action(/^admin:product:delete:([^:]+)$/, async (ctx) => {
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return ctx.answerCbQuery("دسترسی غیرمجاز");
    await ctx.answerCbQuery();
    await AdminService.deleteProduct(ctx.match[1], String(ctx.from.id));
    await renderPanel(ctx, { id: "admin.products" }, "replace");
  });

  bot.action(/^admin:deposit:(approve|reject):(.+)$/, async (ctx) => {
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return ctx.answerCbQuery("دسترسی غیرمجاز");
    await ctx.answerCbQuery();
    if (ctx.match[1] === "approve") await DepositService.approve(ctx.match[2], String(ctx.from.id));
    else await DepositService.reject(ctx.match[2], String(ctx.from.id));
    await renderPanel(ctx, { id: "admin.deposits" }, "replace");
  });

  bot.action(/^admin:ticket:close:(.+)$/, async (ctx) => {
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return ctx.answerCbQuery("دسترسی غیرمجاز");
    await ctx.answerCbQuery();
    await SupportService.closeTicket(ctx.match[1], String(ctx.from.id));
    await renderPanel(ctx, { id: "admin.tickets" }, "replace");
  });

  bot.on("photo", async (ctx, next) => {
    const photo = ctx.message.photo[ctx.message.photo.length - 1];
    if (photo && (await handleActiveFlowPhoto(ctx, photo.file_id))) return;
    return next();
  });

  bot.on("text", async (ctx, next) => {
    if (await handleActiveFlowText(ctx, ctx.message.text.trim())) return;
    return next();
  });
}
