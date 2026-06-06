import type { AppBot } from "../../types/bot";
import { registerModernViews } from "../views/modern.views";
import { goBack, parseNavAction, renderPanel, callbackFor } from "../navigation/panel-ui";
import { registerFlowEngine, handleActiveFlowPhoto, handleActiveFlowText } from "../flows/flow-engine";
import { UserService } from "../../modules/user/user.service";
import { ReferralService } from "../../modules/referral/referral.service";
import { PurchaseService } from "../../modules/product/purchase.service";
import { CryptoWalletService, DepositService } from "../../modules/deposit/deposit.service";
import { AdminService } from "../../modules/admin/admin.service";
import { CouponService } from "../../modules/coupon/coupon.service";
import { SupportService } from "../../modules/support/support.service";
import { FreeAccountService, registerFreeAccountEvents } from "../../modules/free-account/free-account.service";
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
      await ctx.editMessageText("⏳ در حال بررسی موجودی، کیف پول و تخصیص اکانت...", { reply_markup: { inline_keyboard: [] } });
      const coupon = ctx.session.selectedCoupons?.[productId];
      const result = await PurchaseService.buyProduct(user.id, productId, coupon);
      delete ctx.session.selectedCoupons?.[productId];
      await ctx.editMessageText(`🎉 خرید شما با موفقیت انجام شد

📦 محصول:
${result.product.title}

💰 مبلغ اصلی: ${result.originalAmount.toLocaleString("fa-IR")} تومان
🎟 تخفیف: ${result.discountAmount.toLocaleString("fa-IR")} تومان
✅ مبلغ پرداختی: ${result.totalAmount.toLocaleString("fa-IR")} تومان
📅 اعتبار تا: ${result.expiresAt.toLocaleDateString("fa-IR")}

👤 نام کاربری:
${result.account.username}

🔗 لینک اشتراک:
${result.account.subscriptionLink}

🧩 لینک کانفیگ:
${result.account.configLink}

این اطلاعات همیشه از بخش «اکانت‌های من» قابل مشاهده است.`, { reply_markup: { inline_keyboard: [[{ text: "📦 اکانت‌های من", callback_data: callbackFor("account.details") }, { text: "🎧 پشتیبانی", callback_data: callbackFor("support") }], [{ text: "🏠 خانه", callback_data: callbackFor("home") }]] } });
    } catch (error) {
      await ctx.editMessageText(`⚠️ خرید تکمیل نشد.

${error instanceof Error ? error.message : "در انجام درخواست مشکلی پیش آمد. لطفاً چند لحظه دیگر دوباره تلاش کنید."}`, { reply_markup: { inline_keyboard: [[{ text: "💳 شارژ کیف پول", callback_data: callbackFor("deposit") }, { text: "⬅️ بازگشت", callback_data: "nav:back" }], [{ text: "🎧 پشتیبانی", callback_data: callbackFor("support") }]] } });
    }
  });

  bot.action(/^favorite:toggle:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const productId = ctx.match[1];
    ctx.session.favoriteProducts ??= {};
    if (ctx.session.favoriteProducts[productId]) {
      delete ctx.session.favoriteProducts[productId];
      await ctx.answerCbQuery("از علاقه‌مندی‌ها حذف شد");
    } else {
      ctx.session.favoriteProducts[productId] = true;
      await ctx.answerCbQuery("به علاقه‌مندی‌ها اضافه شد");
    }
    await renderPanel(ctx, { id: "shop.product", params: { productId } }, "replace");
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
      await ctx.editMessageText(`⏳ درخواست پرداخت آماده شد

مبلغ شارژ:
${quote.amount.toLocaleString("fa-IR")} تومان

رمز ارز:
${quote.wallet.coinName}

شبکه:
${quote.wallet.networkName}

قیمت دلاری هر ${quote.wallet.coinName}:
${quote.coinUsdPrice ? `${quote.coinUsdPrice.toLocaleString("fa-IR")} دلار` : "نرخ ذخیره‌شده"}

نرخ دلار به تومان:
${quote.usdTomanRate ? `${quote.usdTomanRate.toLocaleString("fa-IR")} تومان` : "نرخ ذخیره‌شده"}

قیمت تومان هر ${quote.wallet.coinName}:
${quote.exchangeRate.toLocaleString("fa-IR")} تومان

مبلغ نهایی قابل پرداخت:
${quote.cryptoAmount.toLocaleString("fa-IR", { maximumFractionDigits: 8 })} ${quote.wallet.coinName}

آدرس کیف پول:
${quote.wallet.walletAddress}

⏳ مهلت پرداخت: ۳۰ دقیقه
📤 پس از پرداخت، تصویر رسید را ارسال کنید.`, { reply_markup: { inline_keyboard: [[{ text: "❌ لغو", callback_data: "flow:cancel" }]] } });
    } catch (error) {
      await ctx.reply(`⚠️ ${error instanceof Error ? error.message : "ایجاد درخواست شارژ ناموفق بود. لطفاً دوباره تلاش کنید."}`);
    }
  });

  bot.action("freeAccount:claim", async (ctx) => {
    await ctx.answerCbQuery();
    if (!ctx.from) return;
    const user = await UserService.getByTelegramId(ctx.from.id);
    if (!user) return;
    try {
      const account = await FreeAccountService.assign(user.id, "user_claim");
      await ctx.reply(`✅ اکانت تست رایگان اختصاص یافت.\n\nنام کاربری: ${account.username}\nلینک اشتراک: ${account.subscriptionLink}\nلینک کانفیگ: ${account.configLink}\nمدت: ${account.durationDays.toLocaleString("fa-IR")} روز`);
    } catch (error) {
      await ctx.answerCbQuery(error instanceof Error ? error.message : "دریافت اکانت رایگان ناموفق بود");
    }
    await renderPanel(ctx, { id: "freeAccount" }, "replace");
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



  bot.action(/^admin:coupon:status:([^:]+):(active|inactive)$/, async (ctx) => {
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return ctx.answerCbQuery("دسترسی غیرمجاز");
    await ctx.answerCbQuery();
    await CouponService.setStatus(ctx.match[1], ctx.match[2] as "active" | "inactive", String(ctx.from.id));
    await renderPanel(ctx, { id: "admin.coupon", params: { couponId: ctx.match[1] } }, "replace");
  });

  bot.action(/^admin:coupon:(soft_delete|hard_delete):([^:]+)$/, async (ctx) => {
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return ctx.answerCbQuery("دسترسی غیرمجاز");
    await ctx.answerCbQuery();
    if (ctx.match[1] === "soft_delete") await CouponService.softDelete(ctx.match[2], String(ctx.from.id));
    else await CouponService.hardDelete(ctx.match[2], String(ctx.from.id));
    await renderPanel(ctx, { id: "admin.coupons" }, "replace");
  });

  bot.action(/^admin:forced_join:status:([^:]+):(active|inactive)$/, async (ctx) => {
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return ctx.answerCbQuery("دسترسی غیرمجاز");
    await ctx.answerCbQuery();
    await AdminService.setForcedJoinStatus(ctx.match[1], ctx.match[2] as "active" | "inactive", String(ctx.from.id));
    await renderPanel(ctx, { id: "admin.forcedJoin" }, "replace");
  });

  bot.action(/^admin:forced_join:delete:([^:]+)$/, async (ctx) => {
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return ctx.answerCbQuery("دسترسی غیرمجاز");
    await ctx.answerCbQuery();
    await AdminService.deleteForcedJoinChannel(ctx.match[1], String(ctx.from.id));
    await renderPanel(ctx, { id: "admin.forcedJoin" }, "replace");
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
    try {
      if (ctx.match[1] === "approve") await DepositService.approve(ctx.match[2], String(ctx.from.id));
      else await DepositService.reject(ctx.match[2], String(ctx.from.id));
    } catch (error) {
      await ctx.answerCbQuery(error instanceof Error ? error.message : "عملیات ناموفق بود");
    }
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
