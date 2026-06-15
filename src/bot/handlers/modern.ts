import type { AppBot, AppContext } from "../../types/bot";
import { registerModernViews } from "../views/modern.views";
import { goBack, parseNavAction, renderPanel, callbackFor, actionFor, RenderMode } from "../navigation/panel-ui";
import { createCallbackToken, resolveCallbackToken, tokenAction } from "../navigation/callback-tokens";
import { registerFlowEngine, handleActiveFlowPhoto, handleActiveFlowText, startFlow } from "../flows/flow-engine";
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
import { quickReplyTarget } from "../keyboards/reply.keyboard";
import { InvoiceActionKeyboard } from "../keyboards/design-system";
import { purchaseSuccessMessage } from "../../utils/messages";
import { MonitoringService } from "../../services/monitoring.service";
import { ProductGuideService } from "../../modules/system/product-guide.service";
import { PublicPlansService } from "../../modules/product/public-plans.service";
import { XrayClientService, XrayPanelService, xrayInboundSnapshot } from "../../modules/xray/xray.service";
import { prisma } from "../../services/prisma";


export function registerModernHandlers(bot: AppBot) {
  registerModernViews();
  registerFlowEngine(bot);

  async function handleQuickReplyNavigation(ctx: AppContext, text: string) {
    const target = quickReplyTarget(text);
    if (!target) return false;
    if (target === "refresh") {
      const stack = ctx.session.navigation?.stack ?? [];
      const current = stack[stack.length - 1] ?? { id: "home" as const };
      await renderPanel(ctx, current, "replace", RenderMode.SEND_NEW);
      return true;
    }
    if (target === "claimFree") {
      await renderPanel(ctx, { id: "freeAccount" }, "replace");
      return true;
    }
    if (target === "newTicket") {
      if (!ctx.from) return true;
      const user = await UserService.getByTelegramId(ctx.from.id);
      if (!user) return true;
      const ticket = await SupportService.getOrCreateOpenTicket(user.id);
      ctx.session.liveTicketId = ticket.id;
      ctx.session.liveTicketRole = "user";
      await ctx.reply(`💬 گفتگوی پشتیبانی فعال شد

تیکت: #${ticket.id.slice(-6).toUpperCase()}

پیام خود را ارسال کنید.`, { reply_markup: { inline_keyboard: [[{ text: "✅ بستن تیکت", callback_data: actionFor("support:close", ticket.id) }], [{ text: "🏠 خانه", callback_data: callbackFor("home") }]] } });
      return true;
    }
    if (target.id.startsWith("admin") && (!ctx.from || !(await isAdminByTelegramId(ctx.from.id)))) {
      await ctx.reply("⛔ دسترسی غیرمجاز");
      return true;
    }
    if (target.id === "home") {
      ctx.session.liveTicketId = undefined;
      ctx.session.liveTicketRole = undefined;
      ctx.session.flow = undefined;
    }
    await renderPanel(ctx, target, "replace");
    return true;
  }


  // Temporary compatibility redirects for old inline buttons. New visible buttons must use callbackFor()/nav:* actions.
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

  bot.action("free_config", async (ctx) => {
    await ctx.answerCbQuery("این بخش به اکانت تست منتقل شد");
    await renderPanel(ctx, { id: "freeAccount" }, "replace");
  });

  bot.action("free_config:claim", async (ctx) => {
    await ctx.answerCbQuery("برای دریافت از اکانت تست استفاده کنید");
    await renderPanel(ctx, { id: "freeAccount" }, "replace");
  });



  const publicPlansCooldown = new Map<number, number>();
  async function handlePublicPlansCommand(ctx: AppContext) {
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    const isPrivate = ctx.chat?.type === "private";
    if (isPrivate) {
      await renderPanel(ctx, { id: "shop.categories" }, "replace");
      return;
    }
    const setting = await PublicPlansService.getSetting();
    if (!setting.enabled) { if (isPrivate) await ctx.reply("نمایش پلن‌ها در گروه‌ها فعلاً غیرفعال است."); return; }
    const now = Date.now();
    if (!isPrivate && (publicPlansCooldown.get(chatId) ?? 0) > now - 60_000) return;
    publicPlansCooldown.set(chatId, now);
    const categories = await PublicPlansService.listPublicPlans();
    const botInfo = await ctx.telegram.getMe();
    const planLines = categories.map((category) => `📂 ${category.name}\n\n${category.products.map((product) => {
      const duration = product.mode === "xray_auto" ? (product.durationDays ?? product.duration) : product.duration;
      const traffic = product.mode === "xray_auto" && product.trafficBytes ? `\nحجم: ${(Number(product.trafficBytes) / 1_073_741_824).toLocaleString("fa-IR")} GB` : "";
      return `▫️ ${product.title}${traffic}\nمدت: ${duration.toLocaleString("fa-IR")} روز\nقیمت: ${product.price.toLocaleString("fa-IR")} تومان\nموجودی: ${product.availableStock.toLocaleString("fa-IR")}`;
    }).join("\n\n")}`).join("\n\n━━━━━━━━━━━━━━\n\n");
    const text = `🛒 پلن‌های فعال فروشگاه\n\n━━━━━━━━━━━━━━\n\n${planLines || "در حال حاضر پلن آماده فروشی وجود ندارد."}\n\n━━━━━━━━━━━━━━\nبرای خرید و مشاهده جزئیات، وارد ربات شوید.`;
    await ctx.reply(text.slice(0, 3900), { reply_markup: { inline_keyboard: [[{ text: "🛒 خرید سرویس", url: `https://t.me/${botInfo.username}?start=shop` }]] } });
  }

  bot.command(["plans", "plan", "products"], handlePublicPlansCommand);

  const userCommands: Array<[string | string[], Parameters<typeof renderPanel>[1]]> = [
    ["menu", { id: "home" }],
    ["shop", { id: "shop.categories" }],
    ["wallet", { id: "wallet" }],
    ["accounts", { id: "account.details" }],
    ["support", { id: "support" }],
    [["help", "guide"], { id: "productGuide" }],
    ["referral", { id: "referral" }],
  ];

  for (const [command, state] of userCommands) {
    bot.command(command, async (ctx) => {
      await renderPanel(ctx, state, "replace");
    });
  }

  const adminCommands: Array<[string, Parameters<typeof renderPanel>[1]]> = [
    ["admin", { id: "admin.dashboard" }],
    ["store", { id: "admin.store" }],
    ["finance", { id: "admin.finance" }],
    ["payments", { id: "admin.finance" }],
    ["tickets", { id: "admin.tickets" }],
    ["settings", { id: "admin.botSettings" }],
    ["monitoring", { id: "admin.monitoring" }],
    ["stats", { id: "admin.analytics" }],
  ];

  for (const [command, state] of adminCommands) {
    bot.command(command, async (ctx) => {
      if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) {
        await ctx.reply("⛔ این دستور مخصوص مدیران است. اگر فکر می‌کنید اشتباهی رخ داده، با پشتیبانی تماس بگیرید.");
        return;
      }
      await renderPanel(ctx, state, "replace");
    });
  }

  bot.start(async (ctx) => {
    if (!ctx.from) return;
    const user = await UserService.findOrCreateUser(ctx);
    const payload = ctx.startPayload;
    if (payload === "shop") { await renderPanel(ctx, { id: "shop.categories" }, "replace"); return; }
    if (payload) await ReferralService.linkReferral(user.id, payload);
    await renderPanel(ctx, { id: "home" }, "replace");
  });

  bot.action(/^nav:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (ctx.match[1] === "back") return goBack(ctx);
    const state = parseNavAction(`nav:${ctx.match[1]}`);
    if (!state) {
      MonitoringService.record({ type: "BUTTON_DATA_INVALID", section: "Telegram Callback", description: `Invalid nav callback: nav:${ctx.match[1]}`, telegramId: ctx.from?.id ? String(ctx.from.id) : undefined, userId: ctx.state.userId, severity: "warning", suggestedAction: "callback_data دکمه‌های منتشرشده را بررسی کنید." });
      return;
    }
    if (state.id.startsWith("admin") && (!ctx.from || !(await isAdminByTelegramId(ctx.from.id)))) {
      await ctx.answerCbQuery("دسترسی غیرمجاز");
      return;
    }
    await renderPanel(ctx, state, "push", RenderMode.EDIT_CURRENT);
  });

  bot.action(/^cat:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    await renderPanel(ctx, { id: "shop.products", params: { categoryId: ctx.match[1] } }, "replace", RenderMode.EDIT_CURRENT);
  });

  bot.action(/^product:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    await renderPanel(ctx, { id: "shop.product", params: { productId: ctx.match[1] } }, "replace", RenderMode.EDIT_CURRENT);
  });



  async function sendPurchaseDelivery(ctx: AppContext, result: Awaited<ReturnType<typeof PurchaseService.buyProduct>>) {
    if (result.product.mode === "xray_auto") {
      const client = result.xrayClient ?? (result.orderItem?.xrayClientId ? await prisma.xrayClient.findUnique({ where: { id: result.orderItem.xrayClientId } }) : null);
      if (!client) {
        await ctx.reply(`✅ خرید با موفقیت انجام شد

سرویس ساخته شده است. لطفاً از بخش «📦 اکانت‌های من» آن را باز کنید.`, { reply_markup: { inline_keyboard: [[{ text: "📦 اکانت‌های من", callback_data: callbackFor("account.details") }], [{ text: "🏠 خانه", callback_data: callbackFor("home") }]] } });
        return;
      }
      await ctx.reply(`✅ خرید با موفقیت انجام شد

سرویس شما ساخته شد و آماده استفاده است.

برای دریافت لینک اشتراک، QR و کانفیگ‌ها از دکمه‌های زیر استفاده کنید.`, { reply_markup: { inline_keyboard: [[{ text: "📦 مشاهده سرویس", callback_data: callbackFor("account.xray", { xrayClientId: client.id }) }], [{ text: "🔗 دریافت لینک اشتراک", callback_data: `xray:sub:${client.id}` }, { text: "⚙️ دریافت کانفیگ‌ها", callback_data: `xray:configs:${client.id}` }], [{ text: "🏠 خانه", callback_data: callbackFor("home") }]] } });
      return;
    }
    await ctx.reply(purchaseSuccessMessage({
      productTitle: result.product.title,
      username: result.account.username,
      subscriptionLink: result.account.subscriptionLink,
      config: result.account.configLink,
      expiresAt: result.expiresAt,
    }), { reply_markup: { inline_keyboard: [[{ text: "📦 اکانت‌های من", callback_data: callbackFor("account.details") }, { text: "🛒 خرید مجدد", callback_data: callbackFor("shop.categories") }], [{ text: "🏠 خانه", callback_data: callbackFor("home") }]] } });
  }

  async function ownedXrayClient(ctx: AppContext, id: string) {
    if (!ctx.from) return null;
    const user = await UserService.getByTelegramId(ctx.from.id);
    if (!user) return null;
    return prisma.xrayClient.findFirst({ where: { id, userId: user.id }, include: { product: true } });
  }

  bot.action(/^xray:sub:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const client = await ownedXrayClient(ctx, ctx.match[1]);
    if (!client) return void await ctx.reply("⚠️ سرویس پیدا نشد.");
    try {
      const url = await XrayClientService.subscriptionUrl(client);
      await XrayClientService.subLinks(client.clientSubId!).catch(() => null);
      await ctx.reply(`🔗 لینک اشتراک شما\n\n${url}\n\nاین لینک را داخل برنامه‌هایی مثل v2rayNG, Streisand, Hiddify یا Nekobox وارد کنید.`, { reply_markup: { inline_keyboard: [[{ text: "📲 نمایش QR", callback_data: `xray:qr:${client.id}` }, { text: "⚙️ دریافت کانفیگ‌ها", callback_data: `xray:configs:${client.id}` }], [{ text: "🔙 بازگشت", callback_data: callbackFor("account.xray", { xrayClientId: client.id }) }]] } });
    } catch (error) { await ctx.reply(`⚠️ لینک اشتراک در دسترس نیست\n\n${error instanceof Error ? error.message : "خطای نامشخص"}`); }
  });

  bot.action(/^xray:qr:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const client = await ownedXrayClient(ctx, ctx.match[1]);
    if (!client) return void await ctx.reply("⚠️ سرویس پیدا نشد.");
    try {
      const url = await XrayClientService.subscriptionUrl(client);
      const qr = `https://api.qrserver.com/v1/create-qr-code/?size=512x512&data=${encodeURIComponent(url)}`;
      await ctx.replyWithPhoto(qr, { caption: "📲 QR لینک اشتراک\n\nبا اسکن این کد، لینک اشتراک شما در برنامه قابل افزودن است." });
    } catch (error) { await ctx.reply(`⚠️ ساخت QR ناموفق بود\n\n${error instanceof Error ? error.message : "خطای نامشخص"}`); }
  });

  bot.action(/^xray:configs:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery("در حال دریافت کانفیگ‌ها...");
    const client = await ownedXrayClient(ctx, ctx.match[1]);
    if (!client) return void await ctx.reply("⚠️ سرویس پیدا نشد.");
    try {
      const raw = await XrayClientService.links(client.clientEmail);
      const configs = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(/\r?\n/).filter(Boolean) : Object.values(raw ?? {}).flat().map(String);
      if (!configs.length) return void await ctx.reply("⚠️ کانفیگی از پنل دریافت نشد.");
      for (let i = 0; i < configs.length; i++) await ctx.reply(`⚙️ کانفیگ ${i + 1}\n\n${configs[i]}`);
      await ctx.reply(`✅ تمام کانفیگ‌های شما ارسال شد.\n\nتعداد کانفیگ‌ها:\n${configs.length.toLocaleString("fa-IR")}`, { reply_markup: { inline_keyboard: [[{ text: "🔗 لینک اشتراک", callback_data: `xray:sub:${client.id}` }, { text: "🔙 بازگشت", callback_data: callbackFor("account.xray", { xrayClientId: client.id }) }]] } });
    } catch (error) { await ctx.reply(`⚠️ دریافت کانفیگ‌ها ناموفق بود\n\n${error instanceof Error ? error.message : "خطای نامشخص"}`); }
  });

  async function renewWithWallet(ctx: AppContext, xrayClientId: string, productId: string) {
    if (!ctx.from) return;
    const user = await UserService.getByTelegramId(ctx.from.id);
    if (!user) return;
    try {
      await ctx.editMessageText("⏳ در حال تمدید سرویس از کیف پول...", { reply_markup: { inline_keyboard: [] } });
      const renewal = await PaymentInvoiceService.renewXrayWithWallet(user.id, xrayClientId, productId);
      await ctx.reply(`✅ سرویس با موفقیت تمدید شد.\n\nاعتبار جدید: ${renewal.newExpiry.toLocaleDateString("fa-IR")}`, { reply_markup: { inline_keyboard: [[{ text: "🧩 مشاهده سرویس", callback_data: callbackFor("account.xray", { xrayClientId }) }]] } });
    } catch (error) { await ctx.reply(`⚠️ تمدید ناموفق بود\n\n${error instanceof Error ? error.message : "خطای نامشخص"}`); }
  }

  async function renewWithInstantInvoice(ctx: AppContext, xrayClientId: string, productId: string) {
    if (!ctx.from) return;
    const user = await UserService.getByTelegramId(ctx.from.id);
    if (!user) return;
    try {
      const invoice = await PaymentInvoiceService.createXrayRenewalInvoice(user.id, xrayClientId, productId);
      await ctx.reply(`🧾 فاکتور تمدید آماده شد\n\n💰 مبلغ: ${invoice.amount.toLocaleString("fa-IR")} تومان\n\nبرای پرداخت روی دکمه زیر بزنید.`, { reply_markup: { inline_keyboard: [[{ text: "⚡ پرداخت", url: invoice.paymentLink ?? "" }], [{ text: "🔙 بازگشت", callback_data: callbackFor("account.xray", { xrayClientId }) }]] } });
    } catch (error) { await ctx.reply(`⚠️ ایجاد فاکتور تمدید ناموفق بود\n\n${error instanceof Error ? error.message : "خطای نامشخص"}`); }
  }

  bot.action(/^xr:r:s:([^:]+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const payload = resolveCallbackToken(ctx, "renewal", ctx.match[1]);
    if (!payload) return void await ctx.reply("⚠️ این دکمه منقضی شده است. لطفاً لیست تمدید را دوباره باز کنید.");
    return renderPanel(ctx, { id: "account.renew.summary", params: payload }, "push", RenderMode.EDIT_CURRENT);
  });

  bot.action(/^xr:r:w:([^:]+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const payload = resolveCallbackToken(ctx, "renewal", ctx.match[1]);
    if (!payload) return void await ctx.reply("⚠️ این دکمه منقضی شده است. لطفاً خلاصه تمدید را دوباره باز کنید.");
    return renewWithWallet(ctx, payload.xrayClientId, payload.productId);
  });

  bot.action(/^xr:r:i:([^:]+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const payload = resolveCallbackToken(ctx, "renewal", ctx.match[1]);
    if (!payload) return void await ctx.reply("⚠️ این دکمه منقضی شده است. لطفاً خلاصه تمدید را دوباره باز کنید.");
    return renewWithInstantInvoice(ctx, payload.xrayClientId, payload.productId);
  });

  bot.action(/^xray:renew:wallet:([^:]+):([^:]+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    return renewWithWallet(ctx, ctx.match[1], ctx.match[2]);
  });

  bot.action(/^xray:renew:instant:([^:]+):([^:]+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    return renewWithInstantInvoice(ctx, ctx.match[1], ctx.match[2]);
  });

  async function showExpiredCheckoutRecovery(ctx: AppContext) {
    await ctx.reply("این پیش‌فاکتور منقضی شده است.\nلطفاً محصول را دوباره انتخاب کنید.", { reply_markup: { inline_keyboard: [[{ text: "🛒 بازگشت به فروشگاه", callback_data: callbackFor("shop.categories") }, { text: "🏠 خانه", callback_data: callbackFor("home") }]] } });
  }

  bot.action(/^coupon:remove:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const productId = ctx.match[1];
    const product = await ProductService.getProduct(productId);
    if (!product) return showExpiredCheckoutRecovery(ctx);
    if (ctx.session.selectedCoupons?.[productId]) delete ctx.session.selectedCoupons[productId];
    await ctx.reply("✅ کد تخفیف از فاکتور حذف شد.");
    await renderPanel(ctx, { id: "shop.checkout", params: { productId } }, "replace", RenderMode.EDIT_CURRENT);
  });

  bot.action(/^coupon:change:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const productId = ctx.match[1];
    const product = await ProductService.getProduct(productId);
    if (!product) return showExpiredCheckoutRecovery(ctx);
    if (ctx.session.selectedCoupons?.[productId]) delete ctx.session.selectedCoupons[productId];
    await startFlow(ctx, "coupon_code", { productId });
  });

  bot.action(/^coupon:(?!remove:|change:)(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    await renderPanel(ctx, { id: "shop.product", params: { productId: ctx.match[1] } }, "replace", RenderMode.EDIT_CURRENT);
    await ctx.reply("برای اعمال کد تخفیف از دکمه «🎟 اعمال کد تخفیف» در صفحه محصول استفاده کنید.");
  });

  bot.action(/^buy:(?!confirm:|instant:)(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    await renderPanel(ctx, { id: "shop.checkout", params: { productId: ctx.match[1] } }, "replace", RenderMode.EDIT_CURRENT);
  });

  bot.action(/^buy:confirm:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (!ctx.from) return;
    const user = await UserService.getByTelegramId(ctx.from.id);
    if (!user) return;
    const productId = ctx.match[1];
    try {
      await ctx.editMessageText("⏳ در حال بررسی موجودی کیف پول و آماده‌سازی اکانت...", { reply_markup: { inline_keyboard: [] } });
      const coupon = ctx.session.selectedCoupons?.[productId];
      const result = await PurchaseService.buyProduct(user.id, productId, coupon);
      delete ctx.session.selectedCoupons?.[productId];
      await ctx.editMessageText(result.product.mode === "xray_auto" ? "✅ خرید با موفقیت تکمیل شد. سرویس Xray آماده مشاهده است." : "✅ خرید با موفقیت تکمیل شد. اطلاعات اکانت در پیام بعدی ارسال شد.", { reply_markup: { inline_keyboard: [] } });
      await sendPurchaseDelivery(ctx, result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "در انجام درخواست مشکلی پیش آمد. لطفاً چند لحظه دیگر دوباره تلاش کنید.";
      if (/کد تخفیف|کوپن|تخفیف/.test(message)) {
        await ctx.reply(`⚠️ کد تخفیف دیگر قابل استفاده نیست\n\nاین کد بعد از اعمال اولیه منقضی یا مصرف شده است.`, { reply_markup: { inline_keyboard: [[{ text: "🎟 کد تخفیف جدید", callback_data: actionFor("flow:start", "coupon_code", productId) }, { text: "🗑 حذف کد تخفیف", callback_data: actionFor("coupon:remove", productId) }], [{ text: "🔙 بازگشت", callback_data: callbackFor("shop.checkout", { productId }) }]] } });
      } else {
        await ctx.reply(`⚠️ خرید تکمیل نشد\n\n${message}`, { reply_markup: { inline_keyboard: [[{ text: "💳 شارژ کیف پول", callback_data: callbackFor("deposit") }, { text: "⬅️ بازگشت به پیش‌فاکتور", callback_data: callbackFor("shop.checkout", { productId }) }], [{ text: "🎫 پشتیبانی", callback_data: callbackFor("support") }]] } });
      }
    }
  });


  function freeTestInboundKeyboard(inbounds: Awaited<ReturnType<typeof XrayClientService.listInbounds>>, selectedIds: number[]) {
    const selected = new Set(selectedIds);
    const rows = inbounds.map((inbound) => [{ text: `${selected.has(inbound.id) ? "☑" : "☐"} ${inbound.remark ?? inbound.tag ?? `inbound-${inbound.id}`} | ${inbound.protocol ?? "—"} · port ${inbound.port ?? "—"}`, callback_data: `admin:free_test:inbound:toggle:${inbound.id}` }]);
    rows.push([{ text: "✅ ذخیره اینباندها", callback_data: "admin:free_test:inbounds:save" }]);
    rows.push([{ text: "🔄 بروزرسانی لیست", callback_data: "admin:free_test:inbounds" }, { text: "🔙 بازگشت", callback_data: callbackFor("admin.freeAccounts") }]);
    return { inline_keyboard: rows };
  }

  async function showFreeTestInboundSelector(ctx: AppContext) {
    const [cfg, inbounds] = await Promise.all([FreeAccountService.getXrayConfig(), XrayClientService.listInbounds()]);
    const selectedIds = cfg.inboundIds.filter((id) => inbounds.some((inbound) => inbound.id === id));
    ctx.session.freeTestInboundSelection = { inboundOptions: JSON.stringify(inbounds), selectedIds };
    const selected = new Set(selectedIds);
    await ctx.reply(`🔗 انتخاب اینباندهای اکانت تست\n\n${inbounds.map((i) => `${selected.has(i.id) ? "☑" : "☐"} ${i.remark ?? i.tag ?? `inbound-${i.id}`} | ${i.protocol ?? "—"}\n${i.protocol ?? "—"} · port ${i.port ?? "—"}`).join("\n\n") || "⚠️ هیچ اینباند زنده‌ای از پنل دریافت نشد."}`, { reply_markup: freeTestInboundKeyboard(inbounds, selectedIds) });
  }

  bot.action("admin:xray:test", async (ctx) => {
    await ctx.answerCbQuery();
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return;
    const result = await XrayPanelService.testConnection();
    await ctx.reply(result.ok ? `✅ اتصال موفق\nتعداد اینباندها: ${result.inboundCount.toLocaleString("fa-IR")}` : `⚠️ اتصال ناموفق\n${result.error}`);
    await renderPanel(ctx, { id: "admin.xraySettings" }, "replace");
  });




  const pickerTargetAlias = { free_test: "f", product_create: "pc", product_edit: "pe" } as const;
  const pickerTargetFromAlias = { f: "free_test", pc: "product_create", pe: "product_edit" } as const;
  type XrayPickerTargetAlias = keyof typeof pickerTargetFromAlias;
  const pickerAlias = (target: "free_test" | "product_create" | "product_edit") => pickerTargetAlias[target];

  function resolvePickerProductId(ctx: AppContext, productOrToken?: string): string | undefined {
    if (!productOrToken) return undefined;
    return resolveCallbackToken(ctx, "xrayPickerProduct", productOrToken)?.productId ?? productOrToken;
  }

  function isExpiredPickerToken(ctx: AppContext, targetAlias: string, productOrToken?: string): boolean {
    if (targetAlias !== "pe" || !productOrToken) return false;
    if (/^[a-f\d]{24}$/i.test(productOrToken)) return false;
    return !resolveCallbackToken(ctx, "xrayPickerProduct", productOrToken);
  }

  async function replyExpiredPickerToken(ctx: AppContext) {
    await ctx.reply("⚠️ این دکمه منقضی شده است. لطفاً صفحه محصول را دوباره باز کنید و لیست را بروزرسانی کنید.");
  }

  function xrayInboundPickerKeyboard(ctxForKeyboard: AppContext, target: "free_test" | "product_create" | "product_edit", inbounds: Awaited<ReturnType<typeof XrayClientService.listInbounds>>, selectedIds: number[], productId?: string) {
    const selected = new Set(selectedIds);
    const targetAlias = pickerAlias(target);
    const token = target === "product_edit" && productId ? createCallbackToken(ctxForKeyboard, "xrayPickerProduct", { target: "product_edit", productId }) : undefined;
    const suffix = productId ? `:${token ?? productId}` : "";
    const rows = inbounds.map((inbound) => [{ text: `${selected.has(inbound.id) ? "☑" : "☐"} ${inbound.remark ?? inbound.tag ?? `inbound-${inbound.id}`} | ${inbound.protocol ?? "—"} · port ${inbound.port ?? "—"}`, callback_data: `xpi:t:${targetAlias}:${inbound.id}${suffix}` }]);
    rows.push([{ text: "✅ ذخیره اینباندها", callback_data: `xpi:s:${targetAlias}${suffix}` }]);
    rows.push([{ text: "🔄 بروزرسانی لیست", callback_data: `xpi:l:${targetAlias}${suffix}` }, { text: "🔙 بازگشت", callback_data: target === "free_test" ? callbackFor("admin.freeAccounts") : productId ? callbackFor("admin.product", { productId }) : callbackFor("admin.products") }]);
    return { inline_keyboard: rows };
  }

  async function showXrayInboundPicker(ctx: AppContext, target: "free_test" | "product_create" | "product_edit", productId?: string) {
    const inbounds = await XrayClientService.listInbounds();
    let selectedIds: number[] = [];
    if (target === "free_test") selectedIds = (await FreeAccountService.getXrayConfig()).inboundIds;
    if (target === "product_edit" && productId) selectedIds = (await AdminService.productDetail(productId)).product?.inboundIds ?? [];
    if (target === "product_create") selectedIds = (ctx.session.flow?.data.inboundIds as number[] | undefined) ?? [];
    selectedIds = selectedIds.filter((id) => inbounds.some((inbound) => inbound.id === id));
    ctx.session.xrayPicker = { target, productId, inboundOptions: JSON.stringify(inbounds), selectedIds };
    const selected = new Set(selectedIds);
    const title = target === "free_test" ? "اکانت تست" : target === "product_edit" ? "محصول" : "محصول جدید";
    await ctx.reply(`🔗 انتخاب اینباندهای ${title}\n\n${target === "product_edit" ? "⚠️ تغییر اینباندها فقط روی خریدهای جدید اعمال می‌شود.\n\n" : ""}${inbounds.map((i) => `${selected.has(i.id) ? "☑" : "☐"} ${i.remark ?? i.tag ?? `inbound-${i.id}`}\n${i.protocol ?? "—"} · port ${i.port ?? "—"}`).join("\n\n") || "⚠️ هیچ اینباند زنده‌ای از پنل دریافت نشد."}`, { reply_markup: xrayInboundPickerKeyboard(ctx, target, inbounds, selectedIds, productId) });
  }

  async function showXrayGroupPicker(ctx: AppContext, target: "free_test" | "product_create" | "product_edit", productId?: string) {
    const groups = await XrayClientService.listGroups();
    ctx.session.xrayPicker = { target, productId, groups: JSON.stringify(groups) };
    const targetAlias = pickerAlias(target);
    const refreshToken = target === "product_edit" && productId ? createCallbackToken(ctx, "xrayPickerProduct", { target: "product_edit", productId }) : undefined;
    const refreshSuffix = productId ? `:${refreshToken ?? productId}` : "";
    const noneToken = createCallbackToken(ctx, "xrayGroupSelect", { target, selected: null, productId });
    const rows = [[{ text: "بدون گروه", callback_data: tokenAction("xpg:s", noneToken) }], ...groups.map((g) => {
      const selectToken = createCallbackToken(ctx, "xrayGroupSelect", { target, selected: g.name, productId });
      return [{ text: `${g.name} (${g.clientCount ?? 0})`, callback_data: tokenAction("xpg:s", selectToken) }];
    }), [{ text: "🔄 بروزرسانی گروه‌ها", callback_data: `xpg:l:${targetAlias}${refreshSuffix}` }, { text: "🔙 بازگشت", callback_data: target === "free_test" ? callbackFor("admin.freeAccounts") : productId ? callbackFor("admin.product", { productId }) : callbackFor("admin.products") }]];
    await ctx.reply(`👥 انتخاب گروه کلاینت\n\n${target === "product_edit" ? "⚠️ تغییر گروه فقط روی خریدهای جدید اعمال می‌شود.\n\n" : ""}${groups.length ? groups.map((g) => `• ${g.name} (${g.clientCount ?? 0})`).join("\n") : "گروهی در پنل تعریف نشده است.\nمی‌توانید «بدون گروه» را انتخاب کنید."}`, { reply_markup: { inline_keyboard: rows } });
  }

  async function completeProductCreateFromPicker(ctx: AppContext) {
    const flow = ctx.session.flow;
    if (!flow || flow.name !== "product_create") throw new Error("فرم ساخت محصول فعال نیست");
    const categoryId = String(flow.data.categoryId ?? "");
    if (!categoryId) throw new Error("دسته‌بندی محصول مشخص نیست");
    await ProductService.create({ mode: "xray_auto", categoryId, title: String(flow.data.title), price: Number(flow.data.price), duration: Number(flow.data.durationDays ?? flow.data.duration), durationDays: Number(flow.data.durationDays ?? flow.data.duration), trafficGB: Number(flow.data.trafficGB), stockLimit: Number(flow.data.stockLimit), inboundIds: flow.data.inboundIds as unknown as number[], inboundSnapshot: String(flow.data.inboundSnapshot), limitIp: Number(flow.data.limitIp ?? 0), xrayGroupName: flow.data.xrayGroupName ? String(flow.data.xrayGroupName) : null, actorId: String(ctx.from?.id ?? "admin") });
    ctx.session.flow = undefined;
  }

  bot.action(/^xpg:l:(f|pc|pe)(?::([^:]+))?$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return;
    if (isExpiredPickerToken(ctx, ctx.match[1], ctx.match[2])) return replyExpiredPickerToken(ctx);
    await showXrayGroupPicker(ctx, pickerTargetFromAlias[ctx.match[1] as XrayPickerTargetAlias], resolvePickerProductId(ctx, ctx.match[2]));
  });

  bot.action(/^admin:xray_picker:group:(free_test|product_create|product_edit)(?::([^:]+))?$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return;
    await showXrayGroupPicker(ctx, ctx.match[1] as any, ctx.match[2]);
  });

  async function saveXrayGroupSelection(ctx: AppContext, target: "free_test" | "product_create" | "product_edit", selected: string | null, productId?: string) {
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return;
    if (target === "free_test") { await FreeAccountService.updateXrayConfig({ groupName: selected }, String(ctx.from.id)); await ctx.reply("✅ گروه اکانت تست ذخیره شد."); return renderPanel(ctx, { id: "admin.freeAccounts" }, "replace"); }
    if (target === "product_edit" && productId) { await AdminService.updateProduct(productId, { xrayGroupName: selected }, String(ctx.from.id)); await ctx.reply("✅ گروه محصول برای خریدهای بعدی ذخیره شد."); return renderPanel(ctx, { id: "admin.product", params: { productId } }, "replace"); }
    if (!ctx.session.flow || ctx.session.flow.name !== "product_create") return void await ctx.reply("⚠️ فرم ساخت محصول فعال نیست.");
    ctx.session.flow.data.xrayGroupName = selected ?? undefined;
    ctx.session.flow.step = "inbounds";
    await showXrayInboundPicker(ctx, "product_create");
  }

  bot.action(/^xpg:s:([^:]+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const payload = resolveCallbackToken(ctx, "xrayGroupSelect", ctx.match[1]);
    if (!payload) return void await ctx.reply("⚠️ این دکمه منقضی شده است. لطفاً لیست گروه‌ها را بروزرسانی کنید.");
    return saveXrayGroupSelection(ctx, payload.target, payload.selected, payload.productId);
  });

  bot.action(/^xpg:s:(f|pc|pe):(n|\d+)(?::([^:]+))?$/, async (ctx) => {
    await ctx.answerCbQuery();
    const target = pickerTargetFromAlias[ctx.match[1] as XrayPickerTargetAlias];
    const groups = ctx.session.xrayPicker?.groups ? JSON.parse(ctx.session.xrayPicker.groups) as Awaited<ReturnType<typeof XrayClientService.listGroups>> : [];
    const selected = ctx.match[2] === "n" ? null : groups[Number(ctx.match[2])]?.name;
    if (ctx.match[2] !== "n" && !selected) return void await ctx.reply("⚠️ گروه انتخابی پیدا نشد. لیست را بروزرسانی کنید.");
    return saveXrayGroupSelection(ctx, target, selected, resolvePickerProductId(ctx, ctx.match[3]));
  });

  bot.action(/^admin:xray_picker:group:select:(free_test|product_create|product_edit):([^:]+)(?::([^:]+))?$/, async (ctx) => {
    await ctx.answerCbQuery();
    const selected = ctx.match[2] === "__none__" ? null : decodeURIComponent(ctx.match[2]);
    return saveXrayGroupSelection(ctx, ctx.match[1] as any, selected, ctx.match[3]);
  });

  bot.action(/^xpi:l:(f|pc|pe)(?::([^:]+))?$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return;
    if (isExpiredPickerToken(ctx, ctx.match[1], ctx.match[2])) return replyExpiredPickerToken(ctx);
    await showXrayInboundPicker(ctx, pickerTargetFromAlias[ctx.match[1] as XrayPickerTargetAlias], resolvePickerProductId(ctx, ctx.match[2]));
  });

  bot.action(/^admin:xray_picker:inbounds:(free_test|product_create|product_edit)(?::([^:]+))?$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return;
    await showXrayInboundPicker(ctx, ctx.match[1] as any, ctx.match[2]);
  });

  bot.action(/^xpi:t:(f|pc|pe):(\d+)(?::([^:]+))?$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return;
    const state = ctx.session.xrayPicker;
    const id = Number(ctx.match[2]);
    const target = pickerTargetFromAlias[ctx.match[1] as XrayPickerTargetAlias];
    if (isExpiredPickerToken(ctx, ctx.match[1], ctx.match[3])) return replyExpiredPickerToken(ctx);
    if (!state?.inboundOptions) return showXrayInboundPicker(ctx, target, resolvePickerProductId(ctx, ctx.match[3]));
    const inbounds = JSON.parse(state.inboundOptions) as Awaited<ReturnType<typeof XrayClientService.listInbounds>>;
    if (!inbounds.some((inbound) => inbound.id === id)) return void await ctx.reply("⚠️ اینباند انتخابی در لیست زنده وجود ندارد.");
    state.selectedIds = (state.selectedIds ?? []).includes(id) ? (state.selectedIds ?? []).filter((item) => item !== id) : [...(state.selectedIds ?? []), id];
    await ctx.editMessageReplyMarkup(xrayInboundPickerKeyboard(ctx, target, inbounds, state.selectedIds, resolvePickerProductId(ctx, ctx.match[3]))).catch(() => undefined);
  });

  bot.action(/^admin:xray_picker:inbound:toggle:(free_test|product_create|product_edit):(\d+)(?::([^:]+))?$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return;
    const state = ctx.session.xrayPicker;
    const id = Number(ctx.match[2]);
    if (!state?.inboundOptions) return showXrayInboundPicker(ctx, ctx.match[1] as any, ctx.match[3]);
    const inbounds = JSON.parse(state.inboundOptions) as Awaited<ReturnType<typeof XrayClientService.listInbounds>>;
    if (!inbounds.some((inbound) => inbound.id === id)) return void await ctx.reply("⚠️ اینباند انتخابی در لیست زنده وجود ندارد.");
    state.selectedIds = (state.selectedIds ?? []).includes(id) ? (state.selectedIds ?? []).filter((item) => item !== id) : [...(state.selectedIds ?? []), id];
    await ctx.editMessageReplyMarkup(xrayInboundPickerKeyboard(ctx, ctx.match[1] as any, inbounds, state.selectedIds, ctx.match[3])).catch(() => undefined);
  });

  bot.action(/^xpi:s:(f|pc|pe)(?::([^:]+))?$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return;
    const target = pickerTargetFromAlias[ctx.match[1] as XrayPickerTargetAlias];
    if (isExpiredPickerToken(ctx, ctx.match[1], ctx.match[2])) return replyExpiredPickerToken(ctx);
    const productId = resolvePickerProductId(ctx, ctx.match[2]);
    const state = ctx.session.xrayPicker;
    if (!state?.selectedIds?.length) return void await ctx.reply("⚠️ حداقل یک اینباند لازم است");
    const live = await XrayClientService.listInbounds();
    const liveIds = new Set(live.map((i) => i.id));
    const selectedIds = [...new Set(state.selectedIds)].filter((id) => liveIds.has(id));
    if (!selectedIds.length || selectedIds.length !== state.selectedIds.length) return void await ctx.reply("⚠️ یکی از اینباندهای انتخاب‌شده دیگر در پنل وجود ندارد. لیست را بروزرسانی کنید.");
    const inboundSnapshot = xrayInboundSnapshot(live, selectedIds);
    if (target === "free_test") { await FreeAccountService.updateXrayConfig({ inboundIds: selectedIds, inboundSnapshot }, String(ctx.from.id)); ctx.session.xrayPicker = undefined; await ctx.reply("✅ اینباندهای اکانت تست ذخیره شدند."); return renderPanel(ctx, { id: "admin.freeAccounts" }, "replace"); }
    if (target === "product_edit" && productId) { await AdminService.updateProduct(productId, { inboundIds: selectedIds, inboundSnapshot }, String(ctx.from.id)); ctx.session.xrayPicker = undefined; await ctx.reply("✅ اینباندهای محصول برای خریدهای بعدی ذخیره شد."); return renderPanel(ctx, { id: "admin.product", params: { productId } }, "replace"); }
    if (!ctx.session.flow || ctx.session.flow.name !== "product_create") return void await ctx.reply("⚠️ فرم ساخت محصول فعال نیست.");
    ctx.session.flow.data.inboundIds = selectedIds as any;
    ctx.session.flow.data.inboundSnapshot = inboundSnapshot;
    await completeProductCreateFromPicker(ctx);
    ctx.session.xrayPicker = undefined;
    await ctx.reply("✅ محصول Xray با موجودی خودکار ثبت شد.");
    await renderPanel(ctx, { id: "admin.products" }, "replace");
  });

  bot.action("admin:free_test:inbounds", async (ctx) => {
    await ctx.answerCbQuery();
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return;
    try { await showXrayInboundPicker(ctx, "free_test"); } catch (error) { await ctx.reply(`⚠️ ${error instanceof Error ? error.message : "دریافت اینباندها ناموفق بود"}`); }
  });

  bot.action(/^admin:free_test:inbound:toggle:(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return;
    const state = ctx.session.freeTestInboundSelection;
    if (!state) return showFreeTestInboundSelector(ctx);
    const id = Number(ctx.match[1]);
    const inbounds = JSON.parse(state.inboundOptions) as Awaited<ReturnType<typeof XrayClientService.listInbounds>>;
    if (!inbounds.some((inbound) => inbound.id === id)) return void await ctx.reply("⚠️ اینباند انتخابی در لیست زنده وجود ندارد.");
    state.selectedIds = state.selectedIds.includes(id) ? state.selectedIds.filter((item) => item !== id) : [...state.selectedIds, id];
    await ctx.editMessageReplyMarkup(freeTestInboundKeyboard(inbounds, state.selectedIds)).catch(() => undefined);
  });

  bot.action("admin:free_test:inbounds:save", async (ctx) => {
    await ctx.answerCbQuery();
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return;
    const state = ctx.session.freeTestInboundSelection;
    if (!state?.selectedIds.length) return void await ctx.reply("⚠️ حداقل یک اینباند لازم است");
    try {
      await FreeAccountService.updateXrayConfig({ inboundIds: state.selectedIds }, String(ctx.from.id));
      ctx.session.freeTestInboundSelection = undefined;
      await ctx.reply("✅ اینباندهای اکانت تست ذخیره شدند.");
      await renderPanel(ctx, { id: "admin.freeAccounts" }, "replace");
    } catch (error) {
      await ctx.reply(`⚠️ ${error instanceof Error ? error.message : "ذخیره اینباندها ناموفق بود"}`);
    }
  });

  bot.action(/^admin:free_test:enabled:(0|1)$/ , async (ctx) => {
    await ctx.answerCbQuery();
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return;
    try { await FreeAccountService.updateXrayConfig({ enabled: ctx.match[1] === "1" }, String(ctx.from.id)); } catch (error) { await ctx.reply(`⚠️ ${error instanceof Error ? error.message : "خطا"}`); }
    await renderPanel(ctx, { id: "admin.freeAccounts" }, "replace");
  });

  bot.action(/^admin:xray:enabled:(0|1)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return;
    const config = await prisma.xrayPanelConfig.findFirst({ orderBy: { updatedAt: "desc" } });
    if (!config) return void await ctx.reply("ابتدا تنظیمات پنل Xray را ثبت کنید.");
    await prisma.xrayPanelConfig.update({ where: { id: config.id }, data: { enabled: ctx.match[1] === "1" } });
    await renderPanel(ctx, { id: "admin.xraySettings" }, "replace");
  });

  bot.action(/^admin:xray:refresh:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return;
    try {
      const detail = await AdminService.refreshXrayClient(ctx.match[1]);
      await ctx.reply(`✅ اطلاعات پنل دریافت شد\n${detail.client.clientEmail}`);
    } catch (error) {
      await ctx.reply(`⚠️ دریافت اطلاعات پنل ناموفق بود\n${error instanceof Error ? error.message : "خطای نامشخص"}`);
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
      const coupon = ctx.session.selectedCoupons?.[productId];
      const invoice = await PaymentInvoiceService.createProductInvoice(user.id, productId, coupon);
      delete ctx.session.selectedCoupons?.[productId];
      await ctx.editMessageText("✅ فاکتور پرداخت آنی ساخته شد. جزئیات پرداخت در پیام بعدی ارسال شد.", { reply_markup: { inline_keyboard: [] } });
      await ctx.reply(`🧾 فاکتور پرداخت آماده شد

📦 سرویس:
${product?.title ?? "-"}

💰 مبلغ:
${invoice.originalAmount.toLocaleString("fa-IR")} تومان
🎟 تخفیف:
${invoice.discountAmount.toLocaleString("fa-IR")} تومان${invoice.couponCode ? `
🏷 کد تخفیف:
${invoice.couponCode}` : ""}
✅ مبلغ نهایی:
${invoice.amount.toLocaleString("fa-IR")} تومان

⚡ روش پرداخت:
پرداخت آنی

برای ادامه، روی دکمه پرداخت بزنید.`, InvoiceActionKeyboard(invoice.paymentLink ?? "", callbackFor("shop.checkout", { productId })));
    } catch (error) {
      const message = error instanceof Error ? error.message : "ایجاد پرداخت ناموفق بود";
      if (/کد تخفیف|کوپن|تخفیف/.test(message)) {
        await ctx.reply(`⚠️ کد تخفیف دیگر قابل استفاده نیست\n\nاین کد بعد از اعمال اولیه منقضی یا مصرف شده است.`, { reply_markup: { inline_keyboard: [[{ text: "🎟 کد تخفیف جدید", callback_data: actionFor("flow:start", "coupon_code", productId) }, { text: "🗑 حذف کد تخفیف", callback_data: actionFor("coupon:remove", productId) }], [{ text: "🔙 بازگشت", callback_data: callbackFor("shop.checkout", { productId }) }]] } });
      } else {
        await ctx.reply(`⚠️ ایجاد فاکتور ممکن نیست\n\n${message}`, { reply_markup: { inline_keyboard: [[{ text: "🔙 بازگشت", callback_data: callbackFor("shop.checkout", { productId }) }, { text: "🎫 پشتیبانی", callback_data: callbackFor("support") }]] } });
      }
    }
  });



  bot.action(/^admin:product_guide:status:([^:]+):([01])$/, async (ctx) => {
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return ctx.answerCbQuery("دسترسی غیرمجاز");
    await ctx.answerCbQuery("وضعیت راهنما ذخیره شد");
    await ProductGuideService.setActive(ctx.match[1], ctx.match[2] === "1", String(ctx.from.id));
    await renderPanel(ctx, { id: "admin.productGuides" }, "replace");
  });

  bot.action(/^admin:product_guide:delete:([^:]+)$/, async (ctx) => {
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return ctx.answerCbQuery("دسترسی غیرمجاز");
    await ctx.answerCbQuery("حذف شد");
    await ProductGuideService.delete(ctx.match[1], String(ctx.from.id));
    await renderPanel(ctx, { id: "admin.productGuides" }, "replace");
  });

  bot.action(/^admin:public_plans:(enabled|disabled)$/, async (ctx) => {
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return ctx.answerCbQuery("دسترسی غیرمجاز");
    await ctx.answerCbQuery("تنظیمات ذخیره شد");
    await PublicPlansService.setEnabled(ctx.match[1] === "enabled", String(ctx.from.id));
    await renderPanel(ctx, { id: "admin.productGuides" }, "replace");
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
    await ctx.answerCbQuery("علاقه‌مندی‌ها فعلاً از منو حذف شده است");
    await renderPanel(ctx, { id: "shop.product", params: { productId: ctx.match[1] } }, "replace", RenderMode.EDIT_CURRENT);
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
      await ctx.reply(`💳 درخواست پرداخت آماده شد

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
📤 پس از پرداخت، تصویر رسید را همین‌جا ارسال کنید.`, { reply_markup: { inline_keyboard: [[{ text: "🔙 بازگشت", callback_data: actionFor("flow:back", "deposit", "amount") }, { text: "🏠 خانه", callback_data: callbackFor("home") }], [{ text: "❌ لغو عملیات", callback_data: "flow:cancel" }]] } });
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
      const client = await FreeAccountService.claimXray(user.id);
      await ctx.reply(`🎉 اکانت تست Xray شما آماده است

━━━━━━━━━━━━━━━━

👤 شناسه سرویس:
${client.clientEmail}

⏳ اعتبار:
${client.expiresAt.toLocaleDateString("fa-IR")}

📦 این سرویس به بخش «اکانت‌های من» اضافه شد.`, {
        reply_markup: { inline_keyboard: [[{ text: "📦 مشاهده اکانت", callback_data: callbackFor("account.xray", { xrayClientId: client.id }) }], [{ text: "🏠 خانه", callback_data: callbackFor("home") }]] },
      });
    } catch (error) {
      const failedProvision = !(error instanceof FreeAccountError);
      await ctx.reply(failedProvision ? "درخواست ثبت شد اما ساخت اکانت تست نیازمند بررسی است." : formatFreeAccountError(error), { reply_markup: { inline_keyboard: [[{ text: "📦 اکانت‌های من", callback_data: callbackFor("account.details") }], [{ text: "🎫 پشتیبانی", callback_data: callbackFor("support") }]] } });
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
          [{ text: "✏️ ویرایش", callback_data: actionFor("flow:start", "free_account_edit", account.id) }],
          [{ text: "✅ آماده", callback_data: actionFor("admin:free_account:status", account.id, "available") }, { text: "🚫 منقضی/غیرفعال", callback_data: actionFor("admin:free_account:status", account.id, "expired") }],
          [{ text: "🗑 حذف", callback_data: actionFor("admin:free_account:delete", account.id) }],
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


  bot.action("referral:copy", async (ctx) => {
    await ctx.answerCbQuery("لینک دعوت ارسال شد");
    if (!ctx.from) return;
    const user = await UserService.getByTelegramId(ctx.from.id);
    if (!user) return;
    const botUsername = process.env.BOT_USERNAME ?? (await ctx.telegram.getMe()).username ?? "BOT";
    const link = `https://t.me/${botUsername}?start=${user.referralCode}`;
    await ctx.reply(`🔗 لینک دعوت شما:

${link}

این لینک را برای دوستانتان ارسال کنید.`);
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

  bot.action(/^forced_join:verify:([^:]+)$/, async (ctx) => {
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

پیام خود را ارسال کنید. محدودیتی در تعداد پیام‌ها وجود ندارد.`, { reply_markup: { inline_keyboard: [[{ text: "✅ بستن تیکت", callback_data: actionFor("support:close", ticket.id) }], [{ text: "🏠 خانه", callback_data: callbackFor("home") }]] } });
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
پیام بعدی خود را ارسال کنید.`, { reply_markup: { inline_keyboard: [[{ text: "✅ بستن تیکت", callback_data: actionFor("support:close", ticket.id) }], [{ text: "📜 مشاهده تاریخچه", callback_data: callbackFor("support") }]] } });
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

پاسخ خود را ارسال کنید. هر پیام جداگانه برای کاربر ارسال می‌شود.`, { reply_markup: { inline_keyboard: [[{ text: "👁 مشاهده تاریخچه", callback_data: callbackFor("admin.ticket", { ticketId: ticket.id }) }, { text: "✅ بستن", callback_data: actionFor("admin:ticket:close", ticket.id) }], [{ text: "🛡 پنل مدیریت", callback_data: callbackFor("admin.dashboard") }]] } });
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
    await ctx.reply("⚠️ حذف دائمی دسته‌بندی غیرقابل بازگشت است و محصولات وابسته را هم حذف می‌کند.", { reply_markup: { inline_keyboard: [[{ text: "تایید حذف دائمی", callback_data: actionFor("admin:category:hard_delete:force", ctx.match[1]) }, { text: "لغو", callback_data: callbackFor("admin.category", { categoryId: ctx.match[1] }) }]] } });
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
    await ctx.reply("⚠️ این اکانت از موجودی حذف شود؟", { reply_markup: { inline_keyboard: [[{ text: "تایید حذف", callback_data: actionFor("admin:account:delete:force", ctx.match[1]) }, { text: "لغو", callback_data: callbackFor("admin.account", { accountId: ctx.match[1] }) }]] } });
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
    await ctx.reply("⚠️ این کیف پول حذف شود؟ اگر پرداخت فعال داشته باشد حذف انجام نمی‌شود.", { reply_markup: { inline_keyboard: [[{ text: "تایید حذف", callback_data: actionFor("admin:wallet:delete:force", ctx.match[1]) }, { text: "لغو", callback_data: callbackFor("admin.wallet", { walletId: ctx.match[1] }) }]] } });
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
    await ctx.reply("⚠️ حذف دائمی محصول غیرقابل بازگشت است. اگر محصول سفارش فعال داشته باشد با تایید نهایی هم حذف می‌شود.", { reply_markup: { inline_keyboard: [[{ text: "تایید حذف دائمی", callback_data: actionFor("admin:product:hard_delete:force", ctx.match[1]) }, { text: "لغو", callback_data: callbackFor("admin.product", { productId: ctx.match[1] }) }]] } });
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
    if (await handleQuickReplyNavigation(ctx, text)) return;
    if (await handleActiveFlowText(ctx, text)) return;
    if (ctx.session.liveTicketId && ctx.session.liveTicketRole) {
      try {
        if (ctx.session.liveTicketRole === "admin") {
          if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return next();
          await SupportService.addAdminReply(ctx.session.liveTicketId, String(ctx.from.id), text);
          await ctx.reply("✅ پاسخ ارسال شد. برای ادامه گفتگو، پیام بعدی را ارسال کنید.", { reply_markup: { inline_keyboard: [[{ text: "👁 مشاهده تیکت", callback_data: callbackFor("admin.ticket", { ticketId: ctx.session.liveTicketId }) }, { text: "✅ بستن", callback_data: actionFor("admin:ticket:close", ctx.session.liveTicketId) }]] } });
          return;
        }
        const user = ctx.from ? await UserService.getByTelegramId(ctx.from.id) : undefined;
        if (!user) return next();
        await SupportService.addUserMessage(ctx.session.liveTicketId, user.id, text);
        await ctx.reply("📩 پیام شما ارسال شد. برای ادامه گفتگو، پیام بعدی را ارسال کنید.", { reply_markup: { inline_keyboard: [[{ text: "✅ بستن تیکت", callback_data: actionFor("support:close", ctx.session.liveTicketId) }], [{ text: "🏠 خانه", callback_data: callbackFor("home") }]] } });
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        MonitoringService.record({ type: "TICKET_HANDLER_FAILED", section: "Ticket Handler", description: message, telegramId: ctx.from?.id ? String(ctx.from.id) : undefined, userId: ctx.state.userId, severity: "critical", suggestedAction: "وضعیت تیکت، دسترسی پیام‌رسانی ربات و دیتابیس را بررسی کنید.", metadata: { ticketId: ctx.session.liveTicketId, role: ctx.session.liveTicketRole } });
        await ctx.reply(`⚠️ ${error instanceof Error ? error.message : "ارسال پیام ناموفق بود."}`);
        return;
      }
    }
    return next();
  });
}
