import type { AppBot } from "../../types/bot";
import { registerModernViews } from "../views/modern.views";
import { goBack, parseNavAction, renderPanel, callbackFor } from "../navigation/panel-ui";
import { registerFlowEngine, handleActiveFlowPhoto, handleActiveFlowText } from "../flows/flow-engine";
import { UserService } from "../../modules/user/user.service";
import { ReferralService } from "../../modules/referral/referral.service";
import { PurchaseService } from "../../modules/product/purchase.service";
import { CryptoWalletService, DepositService } from "../../modules/deposit/deposit.service";
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
      await ctx.editMessageText(`✅ خرید با موفقیت انجام شد.

محصول: ${result.product.title}
مبلغ اصلی: ${result.originalAmount.toLocaleString("fa-IR")} تومان
تخفیف: ${result.discountAmount.toLocaleString("fa-IR")} تومان
مبلغ پرداختی: ${result.totalAmount.toLocaleString("fa-IR")} تومان

نام کاربری:
${result.account.username}

لینک ساب:
${result.account.subscriptionLink}

لینک کانفیگ:
${result.account.configLink}

تاریخ انقضا: ${result.expiresAt.toLocaleDateString("fa-IR")}`, { reply_markup: { inline_keyboard: [[{ text: "🏠 خانه", callback_data: callbackFor("home") }]] } });
    } catch (error) {
      await ctx.editMessageText(`❌ ${error instanceof Error ? error.message : "خرید ناموفق بود"}`, { reply_markup: { inline_keyboard: [[{ text: "⬅️ بازگشت", callback_data: "nav:back" }, { text: "🏠 خانه", callback_data: callbackFor("home") }]] } });
    }
  });


  bot.action(/^deposit:wallet:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (!ctx.from) return;
    const flow = ctx.session.flow;
    if (!flow || flow.name !== "deposit_submit" || flow.step !== "wallet") {
      await ctx.reply("ابتدا مبلغ شارژ را وارد کنید.");
      return;
    }
    const user = await UserService.getByTelegramId(ctx.from.id);
    if (!user) return;
    try {
      const walletId = ctx.match[1];
      const amount = Number(flow.data.amount);
      const quote = await CryptoWalletService.quote(walletId, amount);
      const deposit = await DepositService.createDeposit(user.id, amount, walletId);
      flow.step = "receipt";
      flow.data.depositId = deposit.id;
      await ctx.editMessageText(`💳 درخواست شارژ آماده شد\n\nمبلغ شارژ:\n${quote.amount.toLocaleString("fa-IR")} تومان\n\nرمز ارز:\n${quote.wallet.coinName}\n\nشبکه:\n${quote.wallet.networkName}\n\nنرخ:\n${quote.exchangeRate.toLocaleString("fa-IR")} تومان\n\nمبلغ قابل پرداخت:\n${quote.cryptoAmount.toLocaleString("fa-IR", { maximumFractionDigits: 8 })} ${quote.wallet.coinName}\n\nآدرس کیف پول:\n${quote.wallet.walletAddress}\n\n⏳ مهلت پرداخت: ۳۰ دقیقه\n📤 پس از پرداخت، تصویر رسید را ارسال کنید.`, { reply_markup: { inline_keyboard: [[{ text: "❌ لغو", callback_data: "flow:cancel" }]] } });
    } catch (error) {
      await ctx.reply(`❌ ${error instanceof Error ? error.message : "ایجاد درخواست شارژ ناموفق بود"}`);
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


  bot.action(/^admin:store:status:(active|inactive)$/, async (ctx) => {
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return ctx.answerCbQuery("دسترسی غیرمجاز");
    await ctx.answerCbQuery();
    await AdminService.setStoreStatus(ctx.match[1] as "active" | "inactive", String(ctx.from.id));
    await renderPanel(ctx, { id: "admin.store" }, "replace");
  });

  bot.action(/^admin:referral:tier:status:([^:]+):([01])$/, async (ctx) => {
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return ctx.answerCbQuery("دسترسی غیرمجاز");
    await ctx.answerCbQuery();
    await ReferralService.setTierStatus(ctx.match[1], ctx.match[2] === "1", String(ctx.from.id));
    await renderPanel(ctx, { id: "admin.referrals" }, "replace");
  });

  bot.action(/^admin:referral:tier:delete:([^:]+)$/, async (ctx) => {
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return ctx.answerCbQuery("دسترسی غیرمجاز");
    await ctx.answerCbQuery();
    await ReferralService.deleteTier(ctx.match[1], String(ctx.from.id));
    await renderPanel(ctx, { id: "admin.referrals" }, "replace");
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


  bot.action(/^admin:product:hard_delete:confirm:([^:]+)$/, async (ctx) => {
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return ctx.answerCbQuery("دسترسی غیرمجاز");
    await ctx.answerCbQuery();
    await ctx.reply("⚠️ حذف دائمی محصول غیرقابل بازگشت است. اگر محصول سفارش فعال داشته باشد با تایید نهایی هم حذف می‌شود.", { reply_markup: { inline_keyboard: [[{ text: "تایید حذف دائمی", callback_data: `admin:product:hard_delete:force:${ctx.match[1]}` }, { text: "لغو", callback_data: callbackFor("admin.product", { productId: ctx.match[1] }) }]] } });
  });

  bot.action(/^admin:product:hard_delete:force:([^:]+)$/, async (ctx) => {
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return ctx.answerCbQuery("دسترسی غیرمجاز");
    await ctx.answerCbQuery();
    await AdminService.hardDeleteProduct(ctx.match[1], String(ctx.from.id), true);
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
