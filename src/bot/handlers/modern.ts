import type { AppBot } from "../../types/bot";
import { registerModernViews } from "../views/modern.views";
import { goBack, parseNavAction, renderPanel, callbackFor } from "../navigation/panel-ui";
import { registerFlowEngine, handleActiveFlowPhoto, handleActiveFlowText } from "../flows/flow-engine";
import { UserService } from "../../modules/user/user.service";
import { ReferralService } from "../../modules/referral/referral.service";
import { PurchaseService } from "../../modules/product/purchase.service";
import { ProductService } from "../../modules/product/product.service";
import { CryptoWalletService, DepositService } from "../../modules/deposit/deposit.service";
import { AdminService } from "../../modules/admin/admin.service";
import { CouponService } from "../../modules/coupon/coupon.service";
import { SupportService } from "../../modules/support/support.service";
import { FreeAccountError, FreeAccountService, FREE_ACCOUNT_STATUS_LABELS, formatFreeAccountError, formatFreeAccountDate, freeAccountExpiresAt } from "../../modules/free-account/free-account.service";
import { PaymentGatewayService, PaymentInvoiceService } from "../../modules/payment/payment.service";
import { isAdminByTelegramId } from "../middlewares/admin.middleware";


export function registerModernHandlers(bot: AppBot) {
  registerModernViews();
  registerFlowEngine(bot);

  const legacyViews = new Map<string, Parameters<typeof renderPanel>[1]>([
    ["home", { id: "home" }],
    ["shop", { id: "shop.categories" }],
    ["wallet", { id: "wallet" }],
    ["deposit", { id: "deposit" }],
    ["support", { id: "support" }],
    ["referral", { id: "referral" }],
    ["account", { id: "account" }],
    ["freeAccount", { id: "freeAccount" }],
    ["admin:dashboard", { id: "admin.dashboard" }],
    ["admin:deposits", { id: "admin.deposits" }],
    ["admin:tickets", { id: "admin.tickets" }],
    ["admin:users", { id: "admin.users" }],
    ["admin:coupons", { id: "admin.coupons" }],
  ]);

  for (const [action, state] of legacyViews.entries()) {
    bot.action(action, async (ctx) => {
      await ctx.answerCbQuery();
      if (state.id.startsWith("admin") && (!ctx.from || !(await isAdminByTelegramId(ctx.from.id)))) {
        await ctx.answerCbQuery("دسترسی غیرمجاز");
        return;
      }
      ctx.session.flow = undefined;
      if (action === "home") {
        ctx.session.liveTicketId = undefined;
        ctx.session.liveTicketRole = undefined;
      }
      await renderPanel(ctx, state, "replace");
    });
  }

  bot.action("cancel", async (ctx) => {
    ctx.session.flow = undefined;
    ctx.session.liveTicketId = undefined;
    ctx.session.liveTicketRole = undefined;
    await ctx.answerCbQuery("لغو شد");
    await renderPanel(ctx, { id: "home" }, "replace");
  });

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
      await ctx.editMessageText("⏳ در حال بررسی موجودی کیف پول و آماده‌سازی اکانت...", { reply_markup: { inline_keyboard: [] } });
      const coupon = ctx.session.selectedCoupons?.[productId];
      const result = await PurchaseService.buyProduct(user.id, productId, coupon);
      delete ctx.session.selectedCoupons?.[productId];
      await ctx.editMessageText(`🎉 خرید با موفقیت انجام شد

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

این اطلاعات در بخش «اکانت‌های من» نیز همیشه در دسترس است.`, { reply_markup: { inline_keyboard: [[{ text: "📦 اکانت‌های من", callback_data: callbackFor("account.details") }, { text: "🎧 پشتیبانی", callback_data: callbackFor("support") }], [{ text: "🏠 منوی اصلی", callback_data: callbackFor("home") }]] } });
    } catch (error) {
      await ctx.editMessageText(`⚠️ خرید تکمیل نشد

${error instanceof Error ? error.message : "در انجام درخواست مشکلی پیش آمد. لطفاً چند لحظه دیگر دوباره تلاش کنید."}`, { reply_markup: { inline_keyboard: [[{ text: "💳 شارژ کیف پول", callback_data: callbackFor("deposit") }, { text: "⬅️ بازگشت به پیش‌فاکتور", callback_data: "nav:back" }], [{ text: "🎧 پشتیبانی", callback_data: callbackFor("support") }]] } });
    }
  });



  bot.action(/^buy:instant:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (!ctx.from) return;
    const user = await UserService.getByTelegramId(ctx.from.id);
    if (!user) return;
    const productId = ctx.match[1];
    try {
      await ctx.editMessageText("⏳ در حال ایجاد فاکتور پرداخت آنی...", { reply_markup: { inline_keyboard: [] } });
      const product = await ProductService.getProduct(productId);
      const invoice = await PaymentInvoiceService.createProductInvoice(user.id, productId);
      await ctx.editMessageText(`📦 محصول:
${product?.title ?? "-"}

💰 مبلغ:
${invoice.amount.toLocaleString("fa-IR")} تومان

⚡ روش پرداخت:
پرداخت آنی

پس از پرداخت، محصول به صورت خودکار تحویل خواهد شد.`, {
        reply_markup: { inline_keyboard: [[{ text: "⚡ پرداخت", url: invoice.paymentLink ?? "" }], [{ text: "🔙 بازگشت", callback_data: callbackFor("shop.checkout", { productId }) }]] },
      });
    } catch (error) {
      await ctx.editMessageText(`❌ ${error instanceof Error ? error.message : "ایجاد پرداخت ناموفق بود"}`, { reply_markup: { inline_keyboard: [[{ text: "🔙 بازگشت", callback_data: callbackFor("shop.checkout", { productId }) }]] } });
    }
  });

  bot.action(/^admin:payment_gateway:status:(enabled|disabled)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return void (await ctx.answerCbQuery("دسترسی غیرمجاز"));
    try {
      await PaymentGatewayService.setEnabled(ctx.match[1] === "enabled", String(ctx.from.id));
      await renderPanel(ctx, { id: "admin.paymentGateway" }, "replace");
    } catch (error) {
      await ctx.reply(`❌ ${error instanceof Error ? error.message : "تغییر وضعیت درگاه ناموفق بود"}`);
    }
  });

  bot.action("admin:payment_gateway:test", async (ctx) => {
    await ctx.answerCbQuery("در حال تست اتصال...");
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return void (await ctx.answerCbQuery("دسترسی غیرمجاز"));
    const result = await PaymentGatewayService.testConnection(String(ctx.from.id));
    await ctx.reply(`${result.message}

جزئیات:
${result.ok ? JSON.stringify(result.details) : result.error}`);
    await renderPanel(ctx, { id: "admin.paymentGateway" }, "replace");
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
      await ctx.reply("لطفاً ابتدا مبلغ شارژ کیف پول را وارد کنید.");
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
      await ctx.editMessageText(`💳 درخواست پرداخت آماده شد

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
📤 پس از پرداخت، تصویر رسید را همین‌جا ارسال کنید.`, { reply_markup: { inline_keyboard: [[{ text: "❌ لغو عملیات", callback_data: "flow:cancel" }]] } });
    } catch (error) {
      await ctx.reply(`⚠️ ${error instanceof Error ? error.message : "ایجاد درخواست شارژ ناموفق بود. لطفاً دوباره تلاش کنید."}`);
    }
  });

  bot.action("freeAccount:claim", async (ctx) => {
    await ctx.answerCbQuery("در حال آماده‌سازی اکانت تست...");
    if (!ctx.from) return;
    const user = await UserService.getByTelegramId(ctx.from.id);
    if (!user) return;
    try {
      const account = await FreeAccountService.assign(user.id, "user_claim");
      await ctx.reply(`🎉 اکانت تست شما آماده است

━━━━━━━━━━━━━━━━

👤 نام کاربری:
${account.username}

🔗 لینک اشتراک:
${account.subscriptionLink}

⚙️ لینک کانفیگ:
${account.configLink}

⏳ اعتبار:
${account.durationDays.toLocaleString("fa-IR")} روز

📅 تاریخ انقضا:
${account.assignment.expiresAt.toLocaleDateString("fa-IR")}

━━━━━━━━━━━━━━━━

📦 این اکانت به بخش «اکانت‌های من» اضافه شد و در هر زمان می‌توانید اطلاعات آن را مشاهده کنید.`, {
        reply_markup: { inline_keyboard: [[{ text: "📦 اکانت‌های من", callback_data: callbackFor("account.details") }], [{ text: "🏠 منوی اصلی", callback_data: callbackFor("home") }]] },
      });
    } catch (error) {
      const keyboard = error instanceof FreeAccountError && error.code === "ACTIVE_ACCOUNT"
        ? [[{ text: "📦 اکانت‌های من", callback_data: callbackFor("account.details") }], [{ text: "🏠 منوی اصلی", callback_data: callbackFor("home") }]]
        : [[{ text: "🏠 منوی اصلی", callback_data: callbackFor("home") }]];
      await ctx.reply(formatFreeAccountError(error), { reply_markup: { inline_keyboard: keyboard } });
    }
  });


  bot.action(/^admin:free_account:view:([^:]+)$/, async (ctx) => {
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return ctx.answerCbQuery("دسترسی غیرمجاز");
    await ctx.answerCbQuery();
    const account = await FreeAccountService.getAccount(ctx.match[1]);
    if (!account) {
      await ctx.reply("⚠️ اکانت تست پیدا نشد.");
      return;
    }
    const assignment = account.assignment;
    const expiresAt = assignment ? assignment.expiresAt ?? freeAccountExpiresAt(assignment.assignedAt ?? assignment.createdAt, account.durationDays) : undefined;
    await ctx.reply(`🆓 جزئیات اکانت تست

━━━━━━━━━━━━━━━━

👤 نام کاربری:
${account.username}

🔗 لینک اشتراک:
${account.subscriptionLink}

⚙️ لینک کانفیگ:
${account.configLink}

⏳ مدت اعتبار: ${account.durationDays.toLocaleString("fa-IR")} روز
📌 وضعیت: ${FREE_ACCOUNT_STATUS_LABELS[account.status]}
👥 کاربر دریافت‌کننده: ${assignment?.user.telegramId ?? "—"}
📅 تاریخ تخصیص: ${formatFreeAccountDate(assignment?.assignedAt ?? assignment?.createdAt)}
📅 تاریخ انقضا: ${formatFreeAccountDate(expiresAt)}

━━━━━━━━━━━━━━━━`, {
      reply_markup: {
        inline_keyboard: [
          [{ text: "✏️ ویرایش", callback_data: `flow:start:free_account_edit:${account.id}` }],
          [{ text: "✅ آماده", callback_data: `admin:free_account:status:${account.id}:available` }, { text: "🚫 منقضی/غیرفعال", callback_data: `admin:free_account:status:${account.id}:expired` }],
          [{ text: "🗑 حذف", callback_data: `admin:free_account:delete:${account.id}` }],
          [{ text: "🔙 مدیریت اکانت تست", callback_data: callbackFor("admin.freeAccounts") }],
        ],
      },
    });
  });

  bot.action(/^admin:free_account:status:([^:]+):(available|assigned|expired)$/, async (ctx) => {
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return ctx.answerCbQuery("دسترسی غیرمجاز");
    await ctx.answerCbQuery("وضعیت به‌روزرسانی شد");
    try {
      await FreeAccountService.updateAccount(ctx.match[1], { status: ctx.match[2] as "available" | "assigned" | "expired" }, String(ctx.from.id));
    } catch (error) {
      await ctx.reply(error instanceof Error ? `⚠️ ${error.message}` : "⚠️ ویرایش وضعیت ناموفق بود.");
      return;
    }
    await renderPanel(ctx, { id: "admin.freeAccounts" }, "replace");
  });

  bot.action(/^admin:free_account:delete:([^:]+)$/, async (ctx) => {
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return ctx.answerCbQuery("دسترسی غیرمجاز");
    await ctx.answerCbQuery("حذف شد");
    await FreeAccountService.deleteAccount(ctx.match[1], String(ctx.from.id));
    await renderPanel(ctx, { id: "admin.freeAccounts" }, "replace");
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



  bot.action("forced_join:verify", async (ctx) => {
    await ctx.answerCbQuery("عضویت شما تایید شد ✅");
    await renderPanel(ctx, { id: "home" }, "replace");
  });

  bot.action("support:chat:start", async (ctx) => {
    await ctx.answerCbQuery();
    if (!ctx.from) return;
    const user = await UserService.getByTelegramId(ctx.from.id);
    if (!user) return;
    const ticket = await SupportService.getOrCreateOpenTicket(user.id);
    ctx.session.liveTicketId = ticket.id;
    ctx.session.liveTicketRole = "user";
    await ctx.reply(`💬 گفتگوی پشتیبانی فعال شد

تیکت: #${ticket.id.slice(-6).toUpperCase()}

پیام خود را ارسال کنید. محدودیتی در تعداد پیام‌ها وجود ندارد.`, { reply_markup: { inline_keyboard: [[{ text: "✅ بستن تیکت", callback_data: `support:close:${ticket.id}` }], [{ text: "🏠 منوی اصلی", callback_data: callbackFor("home") }]] } });
  });

  bot.action(/^support:chat:([^:]+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (!ctx.from) return;
    const user = await UserService.getByTelegramId(ctx.from.id);
    if (!user) return;
    const ticket = await SupportService.getTicketWithUser(ctx.match[1]);
    if (!ticket || ticket.userId !== user.id) {
      await ctx.reply("⚠️ تیکت پیدا نشد.");
      return;
    }
    if (ticket.status === "closed") await SupportService.reopenTicket(ticket.id, user.id, "user");
    ctx.session.liveTicketId = ticket.id;
    ctx.session.liveTicketRole = "user";
    await ctx.reply(`💬 گفتگو باز شد

تیکت: #${ticket.id.slice(-6).toUpperCase()}
پیام بعدی خود را ارسال کنید.`, { reply_markup: { inline_keyboard: [[{ text: "✅ بستن تیکت", callback_data: `support:close:${ticket.id}` }], [{ text: "📜 مشاهده تاریخچه", callback_data: callbackFor("support") }]] } });
  });

  bot.action(/^support:close:([^:]+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (!ctx.from) return;
    const user = await UserService.getByTelegramId(ctx.from.id);
    if (!user) return;
    const ticket = await SupportService.getTicketWithUser(ctx.match[1]);
    if (!ticket || ticket.userId !== user.id) return ctx.reply("⚠️ تیکت پیدا نشد.");
    await SupportService.closeTicket(ticket.id, user.id, "user");
    ctx.session.liveTicketId = undefined;
    ctx.session.liveTicketRole = undefined;
    await renderPanel(ctx, { id: "support" }, "replace");
  });

  bot.action(/^support:admin:chat:([^:]+)$/, async (ctx) => {
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return ctx.answerCbQuery("دسترسی غیرمجاز");
    await ctx.answerCbQuery();
    let ticket = await SupportService.getTicketWithUser(ctx.match[1]);
    if (!ticket) return ctx.reply("⚠️ تیکت پیدا نشد.");
    if (ticket.status === "closed") {
      await SupportService.reopenTicket(ticket.id, String(ctx.from.id), "admin");
      ticket = await SupportService.getTicketWithUser(ticket.id);
      if (!ticket) return ctx.reply("⚠️ تیکت پیدا نشد.");
    }
    ctx.session.liveTicketId = ticket.id;
    ctx.session.liveTicketRole = "admin";
    await ctx.reply(`💬 چت ادمین فعال شد

تیکت: #${ticket.id.slice(-6).toUpperCase()}
کاربر: ${ticket.user.telegramId}

پاسخ خود را ارسال کنید. هر پیام جداگانه برای کاربر ارسال می‌شود.`, { reply_markup: { inline_keyboard: [[{ text: "👁 مشاهده تاریخچه", callback_data: callbackFor("admin.ticket", { ticketId: ticket.id }) }, { text: "✅ بستن", callback_data: `admin:ticket:close:${ticket.id}` }], [{ text: "🏠 پنل مدیریت", callback_data: callbackFor("admin.dashboard") }]] } });
  });

  bot.action(/^admin:store:status:(active|inactive)$/, async (ctx) => {
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return ctx.answerCbQuery("دسترسی غیرمجاز");
    await ctx.answerCbQuery();
    await AdminService.setStoreStatus(ctx.match[1] as "active" | "inactive", String(ctx.from.id));
    await renderPanel(ctx, { id: "admin.store" }, "replace");
  });

  bot.action(/^admin:category:status:([^:]+):([01])$/, async (ctx) => {
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return ctx.answerCbQuery("دسترسی غیرمجاز");
    await ctx.answerCbQuery();
    await AdminService.setCategoryActive(ctx.match[1], ctx.match[2] === "1", String(ctx.from.id));
    await renderPanel(ctx, { id: "admin.category", params: { categoryId: ctx.match[1] } }, "replace");
  });

  bot.action(/^admin:category:delete:([^:]+)$/, async (ctx) => {
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return ctx.answerCbQuery("دسترسی غیرمجاز");
    await ctx.answerCbQuery();
    await AdminService.deleteCategory(ctx.match[1], String(ctx.from.id));
    await renderPanel(ctx, { id: "admin.categories" }, "replace");
  });

  bot.action(/^admin:category:hard_delete:confirm:([^:]+)$/, async (ctx) => {
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return ctx.answerCbQuery("دسترسی غیرمجاز");
    await ctx.answerCbQuery();
    await ctx.reply("⚠️ حذف دائمی دسته‌بندی غیرقابل بازگشت است و محصولات وابسته را هم حذف می‌کند.", { reply_markup: { inline_keyboard: [[{ text: "تایید حذف دائمی", callback_data: `admin:category:hard_delete:force:${ctx.match[1]}` }, { text: "لغو", callback_data: callbackFor("admin.category", { categoryId: ctx.match[1] }) }]] } });
  });

  bot.action(/^admin:category:hard_delete:force:([^:]+)$/, async (ctx) => {
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return ctx.answerCbQuery("دسترسی غیرمجاز");
    await ctx.answerCbQuery();
    await AdminService.hardDeleteCategory(ctx.match[1], String(ctx.from.id), true);
    await renderPanel(ctx, { id: "admin.categories" }, "replace");
  });

  bot.action(/^admin:account:status:([^:]+):(available|reserved|sold|disabled|expired)$/, async (ctx) => {
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return ctx.answerCbQuery("دسترسی غیرمجاز");
    await ctx.answerCbQuery();
    await AdminService.setAccountStatus(ctx.match[1], ctx.match[2] as "available" | "reserved" | "sold" | "disabled" | "expired", String(ctx.from.id));
    await renderPanel(ctx, { id: "admin.account", params: { accountId: ctx.match[1] } }, "replace");
  });

  bot.action(/^admin:account:move_to:([^:]+):([^:]+)$/, async (ctx) => {
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return ctx.answerCbQuery("دسترسی غیرمجاز");
    await ctx.answerCbQuery();
    const account = await AdminService.moveAccount(ctx.match[1], ctx.match[2], String(ctx.from.id));
    await renderPanel(ctx, { id: "admin.account", params: { accountId: account.id } }, "replace");
  });

  bot.action(/^admin:account:delete:confirm:([^:]+)$/, async (ctx) => {
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return ctx.answerCbQuery("دسترسی غیرمجاز");
    await ctx.answerCbQuery();
    await ctx.reply("⚠️ این اکانت از موجودی حذف شود؟", { reply_markup: { inline_keyboard: [[{ text: "تایید حذف", callback_data: `admin:account:delete:force:${ctx.match[1]}` }, { text: "لغو", callback_data: callbackFor("admin.account", { accountId: ctx.match[1] }) }]] } });
  });

  bot.action(/^admin:account:delete:force:([^:]+)$/, async (ctx) => {
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return ctx.answerCbQuery("دسترسی غیرمجاز");
    await ctx.answerCbQuery();
    await AdminService.deleteAccount(ctx.match[1], String(ctx.from.id));
    await renderPanel(ctx, { id: "admin.accounts" }, "replace");
  });

  bot.action(/^admin:wallet:status:([^:]+):(active|inactive)$/, async (ctx) => {
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return ctx.answerCbQuery("دسترسی غیرمجاز");
    await ctx.answerCbQuery();
    await AdminService.setCryptoWalletStatus(ctx.match[1], ctx.match[2] as "active" | "inactive", String(ctx.from.id));
    await renderPanel(ctx, { id: "admin.wallet", params: { walletId: ctx.match[1] } }, "replace");
  });

  bot.action(/^admin:wallet:delete:confirm:([^:]+)$/, async (ctx) => {
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return ctx.answerCbQuery("دسترسی غیرمجاز");
    await ctx.answerCbQuery();
    await ctx.reply("⚠️ این کیف پول حذف شود؟ اگر پرداخت فعال داشته باشد حذف انجام نمی‌شود.", { reply_markup: { inline_keyboard: [[{ text: "تایید حذف", callback_data: `admin:wallet:delete:force:${ctx.match[1]}` }, { text: "لغو", callback_data: callbackFor("admin.wallet", { walletId: ctx.match[1] }) }]] } });
  });

  bot.action(/^admin:wallet:delete:force:([^:]+)$/, async (ctx) => {
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return ctx.answerCbQuery("دسترسی غیرمجاز");
    await ctx.answerCbQuery();
    try {
      await AdminService.deleteCryptoWallet(ctx.match[1], String(ctx.from.id));
      await renderPanel(ctx, { id: "admin.wallets" }, "replace");
    } catch (error) {
      await ctx.reply(error instanceof Error ? `⚠️ ${error.message}` : "⚠️ حذف کیف پول ناموفق بود.");
      await renderPanel(ctx, { id: "admin.wallet", params: { walletId: ctx.match[1] } }, "replace");
    }
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

  bot.action(/^admin:product:duplicate:([^:]+)$/, async (ctx) => {
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return ctx.answerCbQuery("دسترسی غیرمجاز");
    await ctx.answerCbQuery();
    const product = await AdminService.duplicateProduct(ctx.match[1], String(ctx.from.id));
    await renderPanel(ctx, { id: "admin.product", params: { productId: product.id } }, "replace");
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

  bot.action(/^admin:ticket:([a-f\d]{24})$/i, async (ctx) => {
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return ctx.answerCbQuery("دسترسی غیرمجاز");
    await ctx.answerCbQuery();
    await renderPanel(ctx, { id: "admin.ticket", params: { ticketId: ctx.match[1] } }, "push");
  });

  bot.action(/^admin:ticket:close:(.+)$/, async (ctx) => {
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return ctx.answerCbQuery("دسترسی غیرمجاز");
    await ctx.answerCbQuery();
    await SupportService.closeTicket(ctx.match[1], String(ctx.from.id), "admin");
    if (ctx.session.liveTicketId === ctx.match[1]) {
      ctx.session.liveTicketId = undefined;
      ctx.session.liveTicketRole = undefined;
    }
    await renderPanel(ctx, { id: "admin.ticket", params: { ticketId: ctx.match[1] } }, "replace");
  });

  bot.action(/^admin:ticket:reopen:(.+)$/, async (ctx) => {
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return ctx.answerCbQuery("دسترسی غیرمجاز");
    await ctx.answerCbQuery();
    await SupportService.reopenTicket(ctx.match[1], String(ctx.from.id), "admin");
    await renderPanel(ctx, { id: "admin.ticket", params: { ticketId: ctx.match[1] } }, "replace");
  });

  bot.on("photo", async (ctx, next) => {
    const photo = ctx.message.photo[ctx.message.photo.length - 1];
    if (photo && (await handleActiveFlowPhoto(ctx, photo.file_id))) return;
    return next();
  });

  bot.on("text", async (ctx, next) => {
    const text = ctx.message.text.trim();
    if (await handleActiveFlowText(ctx, text)) return;
    if (ctx.session.liveTicketId && ctx.session.liveTicketRole) {
      try {
        if (ctx.session.liveTicketRole === "admin") {
          if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return next();
          await SupportService.addAdminReply(ctx.session.liveTicketId, String(ctx.from.id), text);
          await ctx.reply("✅ پاسخ ارسال شد. برای ادامه گفتگو، پیام بعدی را ارسال کنید.", { reply_markup: { inline_keyboard: [[{ text: "👁 مشاهده تیکت", callback_data: callbackFor("admin.ticket", { ticketId: ctx.session.liveTicketId }) }, { text: "✅ بستن", callback_data: `admin:ticket:close:${ctx.session.liveTicketId}` }]] } });
          return;
        }
        const user = ctx.from ? await UserService.getByTelegramId(ctx.from.id) : undefined;
        if (!user) return next();
        await SupportService.addUserMessage(ctx.session.liveTicketId, user.id, text);
        await ctx.reply("📩 پیام شما ارسال شد. برای ادامه گفتگو، پیام بعدی را ارسال کنید.", { reply_markup: { inline_keyboard: [[{ text: "✅ بستن تیکت", callback_data: `support:close:${ctx.session.liveTicketId}` }], [{ text: "🏠 منوی اصلی", callback_data: callbackFor("home") }]] } });
        return;
      } catch (error) {
        await ctx.reply(`⚠️ ${error instanceof Error ? error.message : "ارسال پیام ناموفق بود."}`);
        return;
      }
    }
    return next();
  });
}
