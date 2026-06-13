import { registerView, callbackFor, type UiKeyboard } from "../navigation/panel-ui";
import { isAdminByTelegramId } from "../middlewares/admin.middleware";
import { UserService } from "../../modules/user/user.service";
import { ProductService } from "../../modules/product/product.service";
import { AdminService } from "../../modules/admin/admin.service";
import { ReferralService } from "../../modules/referral/referral.service";
import {
  FreeAccountService,
  FREE_ACCOUNT_STATUS_LABELS,
  formatFreeAccountDate,
  freeAccountExpiresAt,
} from "../../modules/free-account/free-account.service";
import { SupportService } from "../../modules/support/support.service";
import { CouponService } from "../../modules/coupon/coupon.service";
import { BroadcastService, BROADCAST_TARGET_LABELS } from "../../modules/broadcast/broadcast.service";
import { PaymentGatewayService, PaymentInvoiceService, maskApiKey } from "../../modules/payment/payment.service";
import type { PaymentInvoiceStatus } from "@prisma/client";
import { accountSummaryMessage, errorMessage, paymentSummaryMessage, walletSummaryMessage } from "../../utils/messages";

const divider = "━━━━━━━━━━━━━━━━";
const money = (value: number) => `${value.toLocaleString("fa-IR")} تومان`;
const page = (params: Record<string, string>) => Math.max(Number(params.page ?? 1), 1);
const pages = (total: number, take: number) => Math.max(Math.ceil(total / take), 1).toLocaleString("fa-IR");
const userLine = (user: { telegramId: string; username?: string | null; firstName?: string | null }) =>
  `${user.firstName ?? "کاربر"} ${user.username ? `@${user.username}` : user.telegramId}`;
const stockLabel = (count: number) => (count > 5 ? "آماده تحویل" : count > 0 ? `فقط ${count.toLocaleString("fa-IR")} عدد` : "ناموجود");
const shortId = (id: string) => id.slice(-6).toUpperCase();
const freeAccountExpiry = (item: { assignedAt?: Date | null; createdAt: Date; expiresAt?: Date | null; account: { durationDays: number } }) =>
  item.expiresAt ?? freeAccountExpiresAt(item.assignedAt ?? item.createdAt, item.account.durationDays);
const yesNo = (value: boolean) => (value ? "فعال ✅" : "غیرفعال ⛔");
const accountStatusLabel = (status: string) =>
  ({ available: "آماده", reserved: "رزرو", sold: "فروخته", disabled: "غیرفعال", expired: "منقضی" })[status] ?? status;
const walletStatusLabel = (status: string) => (status === "active" ? "فعال ✅" : "غیرفعال ⛔");
const paymentStatusLabel = (value: string) =>
  ({ PENDING: "در انتظار بررسی", PAID: "پرداخت‌شده، آماده تحویل", CANCELED: "لغو شده", FAILED: "ناموفق", COMPLETED: "تکمیل شده" } as Record<string, string>)[
    value
  ] ?? value;
const progressBar = (current: number, target: number) => {
  const safeTarget = Math.max(target, 1);
  const filled = Math.min(Math.floor((Math.max(current, 0) / safeTarget) * 10), 10);
  return `${"●".repeat(filled)}${"○".repeat(10 - filled)} ${Math.min(Math.round((current / safeTarget) * 100), 100).toLocaleString("fa-IR")}٪`;
};
const purchasedAccountStatusLabel = (item: { isActive: boolean; expiresAt?: Date | null; productAccount?: { status: string } | null }) => {
  if (item.productAccount?.status === "disabled") return "غیرفعال";
  if (item.productAccount?.status === "expired" || !item.isActive || (item.expiresAt && item.expiresAt <= new Date())) return "منقضی شده";
  return "فعال";
};

export function registerModernViews() {
  registerView("home", async (ctx) => {
    const user = ctx.from ? await UserService.findOrCreateUser(ctx) : undefined;
    const isAdmin = ctx.from ? await isAdminByTelegramId(ctx.from.id) : false;
    const featured = await ProductService.listFeaturedProducts(4);
    const dashboard = user ? await UserService.dashboard(user.id) : undefined;
    const featuredKeyboard = featured.map((product) => [
      { text: `🛒 خرید ${product.title} · ${money(product.price)}`, action: callbackFor("shop.product", { productId: product.id }) },
    ]);
    const keyboard: UiKeyboard = [
      ...featuredKeyboard,
      [{ text: "🛍 مشاهده همه محصولات", action: callbackFor("shop.categories") }],
      [
        { text: "🔎 جستجوی محصول", action: "flow:start:product_search" },
        { text: "💳 شارژ کیف پول", action: callbackFor("deposit") },
      ],
      [
        { text: "📦 اکانت‌های من", action: callbackFor("account.details") },
        { text: "👤 حساب کاربری", action: callbackFor("account") },
      ],
      [
        { text: "🎁 دریافت اکانت تست", action: callbackFor("freeAccount") },
        { text: "🎁 دعوت دوستان", action: callbackFor("referral") },
      ],
      [{ text: "📞 پشتیبانی", action: callbackFor("support") }],
    ];
    if (isAdmin) keyboard.push([{ text: "⚙️ مرکز مدیریت", action: callbackFor("admin.dashboard") }]);

    return {
      text: `سلام ${ctx.from?.first_name ?? "دوست عزیز"} 🌿\n\n${divider}\n👤 خلاصه حساب شما\n\n💰 موجودی کیف پول: ${money(user?.balance ?? 0)}\n👥 تعداد دعوت‌ها: ${(dashboard?.referralCount ?? 0).toLocaleString("fa-IR")} نفر\n🎁 جوایز فعال: ${(dashboard?.freeRewards ?? 0).toLocaleString("fa-IR")}\n📦 اکانت‌های فعال: ${((dashboard?.activeAccounts.length ?? 0) + (dashboard?.activeFreeAccounts.length ?? 0)).toLocaleString("fa-IR")}\n${divider}\n\n✨ سرویس‌های منتخب آماده تحویل هستند. برای ادامه، یکی از دکمه‌های زیر را انتخاب کنید.`,
      keyboard,
      replyKeyboard: isAdmin ? "admin" : "home",
    };
  });

  registerView("shop.categories", async () => {
    const categories = await ProductService.getCategories();
    return {
      replyKeyboard: "shop",
      text: `🛍 فروشگاه نیمه‌شب\n\n${divider}\nدسته‌بندی موردنظر را انتخاب کنید. همه سرویس‌های نمایش‌داده‌شده فعال و آماده تحویل خودکار هستند.`,
      keyboard: [
        [{ text: "🔎 جستجوی محصول", action: "flow:start:product_search" }],
        ...categories.map((category) => [
          {
            text: `📁 ${category.name} (${category.products.length.toLocaleString("fa-IR")})`,
            action: callbackFor("shop.products", { categoryId: category.id }),
          },
        ]),
      ],
    };
  });

  registerView("shop.products", async (_ctx, params) => {
    const products = await ProductService.getProductsByCategory(params.categoryId);
    return {
      text: `📦 انتخاب سرویس\n\n${divider}\nیک سرویس را انتخاب کنید تا جزئیات، موجودی و پیش‌فاکتور را ببینید.`,
      keyboard: products.map((product) => [
        {
          text: `${product.title} · ${money(product.price)} · ${stockLabel(product._count.accounts)}`,
          action: callbackFor("shop.product", { productId: product.id }),
        },
      ]),
    };
  });

  registerView("shop.searchResults", async (ctx, params) => {
    const query = params.q || ctx.session.productSearchQuery || "";
    const products = await ProductService.searchActiveProducts(query, 10);
    return {
      text: `🔎 نتیجه جستجو\n\nعبارت: ${query || "—"}\n${divider}\n${products.length ? "از نتایج زیر یک محصول را انتخاب کنید:" : "موردی پیدا نشد. لطفاً با نام کوتاه‌تر سرویس یا دسته‌بندی دوباره جستجو کنید."}`,
      keyboard: [
        ...products.map((product) => [
          {
            text: `${product.title} · ${money(product.price)} · ${product.category?.name ?? "دسته‌بندی نامعتبر یا حذف‌شده"}`,
            action: callbackFor("shop.product", { productId: product.id }),
          },
        ]),
        [{ text: "🔎 جستجوی جدید", action: "flow:start:product_search" }],
      ],
    };
  });

  registerView("shop.product", async (ctx, params) => {
    const product = await ProductService.getProduct(params.productId);
    if (!product) return { text: errorMessage("محصول در دسترس نیست", "این محصول در حال حاضر قابل خرید نیست.", "لطفاً محصول دیگری را انتخاب کنید."), keyboard: [] };
    const stock = await ProductService.availableStock(product.id);
    ctx.session.recentlyViewedProductIds = [product.id, ...(ctx.session.recentlyViewedProductIds ?? []).filter((id) => id !== product.id)].slice(
      0,
      6,
    );
    const isFavorite = Boolean(ctx.session.favoriteProducts?.[product.id]);
    return {
      text: `📦 ${product.title}\n\n${divider}\n🏷 دسته‌بندی: ${product.category?.name ?? "دسته‌بندی نامعتبر یا حذف‌شده"}\n📅 اعتبار سرویس: ${product.duration.toLocaleString("fa-IR")} روز\n💰 قیمت نهایی: ${money(product.price)}\n🚀 تحویل: فوری و خودکار\n📊 موجودی: ${stockLabel(stock)}\n${divider}\n\nپس از پرداخت، اطلاعات اکانت همین‌جا نمایش داده می‌شود و همیشه از بخش «اکانت‌های من» قابل مشاهده است.`,
      keyboard: [
        [{ text: "✅ ادامه خرید", action: callbackFor("shop.checkout", { productId: product.id }) }],
        [
          { text: "🎟 اعمال کد تخفیف", action: `flow:start:coupon_code:${product.id}` },
          { text: isFavorite ? "💛 حذف از علاقه‌مندی" : "🤍 افزودن به علاقه‌مندی", action: `favorite:toggle:${product.id}` },
        ],
      ],
    };
  });

  registerView("shop.checkout", async (ctx, params) => {
    const user = ctx.from ? await UserService.getByTelegramId(ctx.from.id) : undefined;
    const product = await ProductService.getProduct(params.productId);
    if (!product || !user) return { text: "⚠️ اطلاعات خرید کامل نیست. لطفاً دوباره از فروشگاه اقدام کنید.", keyboard: [] };
    const couponCode = ctx.session.selectedCoupons?.[product.id];
    let couponLine = "ثبت نشده";
    let discountAmount = 0;
    let payableAmount = product.price;
    if (couponCode) {
      try {
        const coupon = await CouponService.validateForUser(couponCode, user.id, undefined, product.price);
        const calculation = CouponService.calculate(coupon, product.price);
        discountAmount = calculation.discountAmount;
        payableAmount = calculation.finalAmount;
        couponLine = `${coupon.code} (${money(discountAmount)} تخفیف)`;
      } catch (error) {
        delete ctx.session.selectedCoupons?.[product.id];
        couponLine = "نیازمند بررسی دوباره";
      }
    }
    const shortage = Math.max(payableAmount - user.balance, 0);
    const gateway = await PaymentGatewayService.get();
    const paymentMethods: UiKeyboard = [[{ text: "1️⃣ کیف پول", action: `buy:confirm:${product.id}` }]];
    if (gateway.enabled) paymentMethods[0].push({ text: "2️⃣ پرداخت آنی", action: `buy:instant:${product.id}` });
    return {
      text: paymentSummaryMessage({ productTitle: product.title, amount: product.price, discountAmount, payableAmount, balance: user.balance, shortage, couponLine, gatewayEnabled: gateway.enabled }),
      keyboard: [
        ...paymentMethods,
        [
          { text: "🎟 اعمال/تغییر کد تخفیف", action: `flow:start:coupon_code:${product.id}` },
          { text: "💳 شارژ کیف پول", action: callbackFor("deposit") },
        ],
      ],
    };
  });

  registerView("account", async (ctx) => {
    const user = ctx.from ? await UserService.getByTelegramId(ctx.from.id) : undefined;
    if (!user) return { text: "⚠️ پروفایل شما پیدا نشد. لطفاً /start را ارسال کنید.", keyboard: [] };
    const dashboard = await UserService.dashboard(user.id);
    return {
      replyKeyboard: "profile",
      text: accountSummaryMessage({ balance: dashboard.user.balance, referralCount: dashboard.referralCount, freeRewards: dashboard.freeRewards, activeAccounts: dashboard.activeAccounts.length + dashboard.activeFreeAccounts.length, recentOrders: dashboard.recentOrders.length, pendingReferralAmount: dashboard.pendingReferralAmount }),
      keyboard: [
        [
          { text: "🛒 خرید", action: callbackFor("shop.categories") },
          { text: "💳 شارژ کیف پول", action: callbackFor("deposit") },
        ],
        [
          { text: "📦 اکانت‌های من", action: callbackFor("account.details") },
          { text: "🎁 دعوت دوستان", action: callbackFor("referral") },
        ],
        [
          { text: "🧾 خریدها", action: callbackFor("account.history") },
          { text: "📜 گردش کیف پول", action: callbackFor("wallet.history") },
        ],
      ],
    };
  });

  registerView("account.details", async (ctx) => {
    const user = ctx.from ? await UserService.getByTelegramId(ctx.from.id) : undefined;
    if (!user) return { text: "⚠️ پروفایل شما پیدا نشد. لطفاً /start را ارسال کنید.", keyboard: [] };
    await FreeAccountService.expireDueAccounts();
    const dashboard = await UserService.dashboard(user.id);
    const activeFreeAccounts = await FreeAccountService.assignedForUser(user.id, true);
    const purchasedAccounts = dashboard.purchasedAccounts;
    return {
      replyKeyboard: "profile",
      text: `📦 اکانت‌های من

${divider}

${
  [
    ...activeFreeAccounts.map(
      (item) => `🎁 اکانت تست رایگان

👤 نام کاربری:
${item.account.username}

🔗 لینک اشتراک:
${item.account.subscriptionLink}

⚙️ لینک کانفیگ:
${item.account.configLink}

📅 تاریخ انقضا:
${freeAccountExpiry(item).toLocaleDateString("fa-IR")}

📌 وضعیت:
فعال و قابل استفاده`,
    ),
    ...purchasedAccounts.map(
      (item) => `🛒 خریداری شده
📦 محصول: ${item.product.title}

👤 نام کاربری:
${item.deliveredUsername}

🔗 لینک اشتراک:
${item.deliveredSubscriptionLink ?? "ثبت نشده"}

⚙️ لینک کانفیگ:
${item.deliveredConfigLink ?? item.deliveredConfig}

📅 تاریخ دریافت:
${item.purchaseDate.toLocaleString("fa-IR")}

⏳ اعتبار:
${item.expiresAt ? `تا ${item.expiresAt.toLocaleDateString("fa-IR")}` : "نامحدود"}

📌 وضعیت:
${purchasedAccountStatusLabel(item)}`,
    ),
  ].join(`

${divider}

`) || "هنوز اکانتی برای نمایش وجود ندارد. می‌توانید از فروشگاه سرویس جدید تهیه کنید یا اکانت تست دریافت کنید."
}

${divider}`,
      keyboard: [
        [
          { text: "🛒 خرید", action: callbackFor("shop.categories") },
          { text: "🎁 اکانت تست", action: callbackFor("freeAccount") },
        ],
        [{ text: "📞 پشتیبانی", action: callbackFor("support") }],
      ],
    };
  });

  registerView("account.history", async (ctx) => {
    const user = ctx.from ? await UserService.getByTelegramId(ctx.from.id) : undefined;
    if (!user) return { text: "⚠️ پروفایل شما پیدا نشد.", keyboard: [] };
    const dashboard = await UserService.dashboard(user.id);
    return {
      text: `🧾 تاریخچه خرید\n\n${dashboard.recentOrders.map((order) => `• #${shortId(order.id)} · ${order.product.title}\n  مبلغ: ${money(order.finalPaidAmount)} · تاریخ: ${order.createdAt.toLocaleDateString("fa-IR")}`).join("\n") || "هنوز خریدی ثبت نشده است."}\n\n⏳ اکانت‌های منقضی‌شده: ${dashboard.expiredAccounts.length.toLocaleString("fa-IR")}`,
      keyboard: [[{ text: "🛒 خرید جدید", action: callbackFor("shop.categories") }]],
    };
  });

  registerView("wallet", async (ctx) => {
    const user = ctx.from ? await UserService.getByTelegramId(ctx.from.id) : undefined;
    return {
      replyKeyboard: "wallet",
      text: walletSummaryMessage(user?.balance ?? 0, "شارژ کیف پول: افزایش موجودی برای خرید سریع‌تر\nتاریخچه تراکنش‌ها: مشاهده واریزها و برداشت‌ها\nبرداشت‌ها: دریافت پاداش‌های قابل برداشت\nپاداش‌ها: جوایز دعوت و پیشنهادهای فعال"),
      keyboard: [
        [
          { text: "➕ شارژ کیف پول", action: callbackFor("deposit") },
          { text: "📜 تاریخچه تراکنش‌ها", action: callbackFor("wallet.history") },
        ],
        [
          { text: "💸 برداشت پاداش", action: "referral:claim" },
          { text: "🎁 پاداش‌ها", action: callbackFor("referral") },
        ],
      ],
    };
  });

  registerView("wallet.history", async (ctx) => {
    const user = ctx.from ? await UserService.getByTelegramId(ctx.from.id) : undefined;
    if (!user) return { text: "⚠️ پروفایل شما پیدا نشد.", keyboard: [] };
    const dashboard = await UserService.dashboard(user.id);
    return {
      text: `📜 گردش کیف پول\n\n${dashboard.walletTransactions.map((tx) => `${tx.type === "credit" || tx.type === "transfer_in" ? "🟢" : "🔴"} ${tx.description}\n${money(tx.amount)} · ${tx.createdAt.toLocaleString("fa-IR")}`).join("\n\n") || "هنوز تراکنشی ثبت نشده است."}`,
      keyboard: [[{ text: "➕ شارژ کیف پول", action: callbackFor("deposit") }]],
    };
  });

  registerView("deposit", async () => {
    const gateway = await PaymentGatewayService.get();
    const keyboard: UiKeyboard = [[{ text: "💎 پرداخت با رمزارز", action: "flow:start:deposit_submit" }]];
    if (gateway.enabled) keyboard[0].push({ text: "⚡ پرداخت آنی", action: "flow:start:instant_topup" });
    return {
      text: `➕ شارژ کیف پول

${divider}
💰 مبلغ
در مرحله بعد مبلغ شارژ را وارد می‌کنید.

⚡ روش پرداخت
${gateway.enabled ? "پرداخت آنی و پرداخت با رمزارز فعال هستند." : "در حال حاضر پرداخت با رمزارز فعال است."}

🔒 وضعیت پرداخت
موجودی فقط پس از تأیید نهایی پرداخت به کیف پول اضافه می‌شود.

روش دلخواه را انتخاب کنید.`,
      keyboard,
    };
  });

  registerView("support", async (ctx) => {
    const user = ctx.from ? await UserService.getByTelegramId(ctx.from.id) : undefined;
    if (!user) return { text: "⚠️ پروفایل شما پیدا نشد. لطفاً /start را ارسال کنید.", keyboard: [] };
    const tickets = await SupportService.listUserTickets(user.id);
    const latestOpen = tickets.find((ticket) => ticket.status === "open");
    return {
      replyKeyboard: "support",
      text: `📞 پشتیبانی

${divider}

💬 برای ارتباط با پشتیبانی وارد گفتگو شوید و پیام خود را ارسال کنید. پاسخ‌ها در همین چت برای شما نمایش داده می‌شود.

📌 وضعیت آخرین تیکت: ${latestOpen ? `باز (#${shortId(latestOpen.id)})` : "تیکت باز ندارید"}

${
  tickets
    .map(
      (ticket) => `• #${shortId(ticket.id)} · ${ticket.status === "open" ? "باز ✅" : "بسته 🔒"} · ${ticket.updatedAt.toLocaleString("fa-IR")}
  ${ticket.messages[0]?.message ?? "بدون پیام"}`,
    )
    .join("\n") || "هنوز تیکتی ثبت نشده است."
}`,
      keyboard: [
        [{ text: latestOpen ? "💬 ادامه گفتگو" : "✉️ ایجاد تیکت جدید", action: "support:chat:start" }],
        ...tickets.slice(0, 3).map((ticket) => [{ text: `👁 تیکت #${shortId(ticket.id)}`, action: `support:chat:${ticket.id}` }]),
      ],
    };
  });

  registerView("referral", async (ctx) => {
    const user = ctx.from ? await UserService.getByTelegramId(ctx.from.id) : undefined;
    if (!user) return { text: "⚠️ پروفایل شما پیدا نشد.", keyboard: [] };
    const stats = await ReferralService.getStats(user.id);
    const botUsername = process.env.BOT_USERNAME ?? "BOT";
    const link = `https://t.me/${botUsername}?start=${user.referralCode}`;
    const nextTarget = Math.max(Math.ceil((stats.totalReferrals + 1) / 5) * 5, 5);
    return {
      text: `🎁 دعوت دوستان

${divider}
👥 تعداد دعوت‌ها
${stats.totalReferrals.toLocaleString("fa-IR")} نفر

🎁 پاداش‌های قابل دریافت
${money(stats.pendingAmount)}

📈 پیشرفت تا پاداش بعدی
${progressBar(stats.totalReferrals % nextTarget, nextTarget)}

🔗 لینک دعوت
${link}

کافی است لینک را برای دوستانتان بفرستید. پس از عضویت موفق، پاداش‌ها در همین بخش نمایش داده می‌شوند.`,
      keyboard: [
        [{ text: "💎 دریافت پاداش", action: "referral:claim" }],
        [{ text: "📋 کپی لینک دعوت", action: callbackFor("referral") }],
      ],
    };
  });

  registerView("freeAccount", async (ctx) => {
    const user = ctx.from ? await UserService.getByTelegramId(ctx.from.id) : undefined;
    if (!user) return { text: "⚠️ پروفایل شما پیدا نشد. لطفاً /start را ارسال کنید.", keyboard: [] };
    const eligibility = await FreeAccountService.eligibility(user.id);
    if (eligibility.reason === "active") {
      return {
        replyKeyboard: "freeAccount",
        text: `⚠️ اکانت تست فعال دارید

${divider}

اکانت تست شما مستقل از دعوت دوستان است و فقط هر ۳۰ روز یک‌بار قابل دریافت است.

برای مشاهده اطلاعات اکانت از بخش «اکانت‌های من» استفاده کنید.

${divider}`,
        keyboard: [[{ text: "📦 اکانت‌های من", action: callbackFor("account.details") }], [{ text: "🏠 منوی اصلی", action: callbackFor("home") }]],
      };
    }
    if (eligibility.reason === "cooldown") {
      const lastClaimAt = eligibility.last?.assignedAt ?? eligibility.last?.createdAt;
      return {
        replyKeyboard: "freeAccount",
        text: `⏳ زمان دریافت بعدی هنوز نرسیده است

${divider}

اکانت تست برای هر کاربر هر ۳۰ روز یک‌بار فعال می‌شود و ارتباطی با تعداد دعوت دوستان ندارد.

📅 دریافت قبلی:
${formatFreeAccountDate(lastClaimAt)}

⏳ امکان دریافت مجدد:
${formatFreeAccountDate(eligibility.nextAvailableAt)}

${divider}`,
        keyboard: [[{ text: "🏠 منوی اصلی", action: callbackFor("home") }]],
      };
    }
    if (eligibility.reason === "blocked") {
      return {
        replyKeyboard: "freeAccount",
        text: `⚠️ دسترسی محدود شده است

${divider}

امکان دریافت اکانت تست برای حساب شما در حال حاضر فعال نیست.

برای بررسی بیشتر می‌توانید با پشتیبانی در ارتباط باشید.

${divider}`,
        keyboard: [[{ text: "📞 پشتیبانی", action: callbackFor("support") }], [{ text: "🏠 منوی اصلی", action: callbackFor("home") }]],
      };
    }
    if (!eligibility.available) {
      return {
        replyKeyboard: "freeAccount",
        text: `🚫 ظرفیت امروز تکمیل شده است

${divider}

اکانت‌های تست محدود و آماده تحویل هستند. موجودی فعلی تمام شده است.

لطفاً بعداً مجدداً مراجعه کنید.

${divider}`,
        keyboard: [[{ text: "🏠 منوی اصلی", action: callbackFor("home") }]],
      };
    }
    return {
      replyKeyboard: "freeAccount",
      text: `🎁 اکانت تست رایگان

${divider}

برای تجربه کیفیت نیمه‌شب، می‌توانید یک اکانت تست محدود و رایگان دریافت کنید.

📌 نکات مهم:

• این هدیه مستقل از دعوت دوستان است.
• هر کاربر هر ۳۰ روز یک‌بار امکان دریافت دارد.
• موجودی اکانت تست محدود است و به‌ترتیب درخواست تحویل می‌شود.
• اطلاعات اکانت پس از دریافت در بخش «اکانت‌های من» ذخیره می‌شود.

${divider}

📌 وضعیت شما:
آماده دریافت

برای دریافت اکانت تست روی دکمه زیر کلیک کنید.`,
      keyboard: [[{ text: "✅ دریافت اکانت تست", action: "freeAccount:claim" }]],
    };
  });

  registerView("admin.dashboard", async () => {
    const stats = await AdminService.dashboard(true);
    return {
      replyKeyboard: "admin",
      text: `⚙️ مرکز مدیریت

${divider}
📊 نمای کلی عملیات

👥 کاربران: ${stats.users.toLocaleString("fa-IR")}
💰 درآمد موفق: ${money(stats.revenue)}
🧾 سفارش‌ها: ${stats.orders.toLocaleString("fa-IR")}
🎧 تیکت‌های فعال: ${stats.openTickets.toLocaleString("fa-IR")}
💳 واریزی‌های منتظر: ${stats.submittedDeposits.toLocaleString("fa-IR")}
📦 موجودی آماده فروش: ${stats.availableAccounts.toLocaleString("fa-IR")}
${divider}

📊 Statistics / آمار
📦 Products / محصولات
📂 Categories / دسته‌بندی‌ها
🗄 Inventory / موجودی
👥 Users / کاربران
💳 Payments / پرداخت‌ها
🎟 Coupons / کوپن‌ها
📢 Broadcasts / اطلاع‌رسانی
⚙️ Settings / تنظیمات

ماژول مدیریتی را انتخاب کنید:`,
      keyboard: [
        [
          { text: "📊 آمار", action: callbackFor("admin.analytics") },
          { text: "👥 کاربران", action: callbackFor("admin.users") },
        ],
        [
          { text: "📦 محصولات", action: callbackFor("admin.products") },
          { text: "📂 دسته‌بندی‌ها", action: callbackFor("admin.categories") },
        ],
        [{ text: "🗄 مدیریت موجودی اکانت‌ها", action: callbackFor("admin.accounts") }],
        [
          { text: "💳 کیف پول‌ها", action: callbackFor("admin.wallets") },
          { text: "⚡ مدیریت پرداخت آنی", action: callbackFor("admin.paymentGateway") },
          { text: "💰 تراکنش‌ها", action: callbackFor("admin.transactions") },
        ],
        [
          { text: "🎟 کوپن‌ها", action: callbackFor("admin.coupons") },
          { text: "🎁 دعوت دوستان", action: callbackFor("admin.referrals") },
        ],
        [
          { text: "🎁 اکانت تست", action: callbackFor("admin.freeAccounts") },
          { text: "📢 اطلاع‌رسانی", action: callbackFor("admin.notifications") },
        ],
        [
          { text: "⚙️ تنظیمات", action: callbackFor("admin.settings") },
          { text: "🎫 تیکت‌ها", action: callbackFor("admin.tickets") },
        ],
      ],
    };
  });

  registerView("admin.users", async (_ctx, params) => {
    const current = page(params);
    const [users, total] = await AdminService.listUsers(current);
    const keyboard = users.map((user) => [
      { text: `👤 ${userLine(user)} · ${money(user.balance)}`, action: callbackFor("admin.user", { userId: user.id }) },
    ]);
    keyboard.push([
      { text: "◀️ قبلی", action: callbackFor("admin.users", { page: Math.max(current - 1, 1) }) },
      { text: "بعدی ▶️", action: callbackFor("admin.users", { page: current + 1 }) },
    ]);
    return { text: `👥 کاربران\n\nصفحه ${current.toLocaleString("fa-IR")} از ${pages(total, 8)}`, keyboard };
  });

  registerView("admin.user", async (_ctx, params) => {
    const profile = await AdminService.userProfile(params.userId);
    if (!profile.user) return { text: "⚠️ کاربر پیدا نشد.", keyboard: [] };
    return {
      text: `👤 خلاصه حساب شما\n\n${userLine(profile.user)}\nموجودی: ${money(profile.user.balance)}\nدعوت موفق: ${profile.referralCount.toLocaleString("fa-IR")}\nوضعیت: ${profile.user.isBanned ? "مسدود" : "فعال"}\n\nخریدهای اخیر:\n${profile.orders.map((order) => `• ${order.product.title} · ${money(order.totalAmount)}`).join("\n") || "خریدی ندارد"}\n\nتراکنش‌های کیف پول:\n${profile.transactions.map((tx) => `• ${tx.description}: ${money(tx.amount)}`).join("\n") || "تراکنشی ندارد"}`,
      keyboard: [
        [
          { text: "➕ افزودن موجودی", action: `flow:start:wallet_adjust:${profile.user.id}:credit` },
          { text: "➖ کسر موجودی", action: `flow:start:wallet_adjust:${profile.user.id}:debit` },
        ],
        [
          {
            text: profile.user.isBanned ? "✅ رفع مسدودی" : "⛔ مسدودسازی",
            action: `admin:user:ban:${profile.user.id}:${profile.user.isBanned ? "0" : "1"}`,
          },
        ],
        [{ text: "📜 سوابق مسدودی", action: callbackFor("admin.user.blocks", { userId: profile.user.id }) }],
      ],
    };
  });

  registerView("admin.user.blocks", async (_ctx, params) => {
    const history = await AdminService.userBlockHistory(params.userId);
    return {
      text: `📜 سوابق مسدودی\n\n${history.map((item) => `• ${item.blocked ? "مسدود" : "رفع مسدودی"} · مدیر: ${item.actorId} · ${item.createdAt.toLocaleString("fa-IR")}${item.reason ? ` · ${item.reason}` : ""}`).join("\n") || "سابقه‌ای ثبت نشده است."}`,
      keyboard: [],
    };
  });

  registerView("admin.products", async (_ctx, params) => {
    const current = page(params);
    const [products, total] = await AdminService.listProducts(current);
    const keyboard = products.map((product) => [
      { text: `📦 ${product.title} · ${money(product.price)}`, action: callbackFor("admin.product", { productId: product.id }) },
    ]);
    keyboard.push([{ text: "➕ محصول جدید", action: "flow:start:product_create" }]);
    keyboard.push([
      { text: "◀️ قبلی", action: callbackFor("admin.products", { page: Math.max(current - 1, 1) }) },
      { text: "بعدی ▶️", action: callbackFor("admin.products", { page: current + 1 }) },
    ]);
    return {
      text: `📦 محصولات

صفحه ${current.toLocaleString("fa-IR")} از ${pages(total, 8)}

${products.map((product) => `• ${product.title}
  دسته‌بندی: ${product.category?.name ?? "دسته‌بندی نامعتبر یا حذف‌شده"}
  قیمت: ${money(product.price)}
  موجودی: ${product.inventoryCount.toLocaleString("fa-IR")} · فروخته‌شده: ${product.soldCount.toLocaleString("fa-IR")} · فعال: ${product.activeCount.toLocaleString("fa-IR")}`).join("\n\n") || "محصولی ثبت نشده است."}`,
      keyboard,
    };
  });

  registerView("admin.product", async (_ctx, params) => {
    const detail = await AdminService.productDetail(params.productId);
    if (!detail.product) return { text: "⚠️ محصول پیدا نشد.", keyboard: [] };
    return {
      text: `📦 ${detail.product.title}

دسته‌بندی: ${detail.product.category?.name ?? "دسته‌بندی نامعتبر یا حذف‌شده"}
قیمت: ${money(detail.product.price)}
مدت: ${detail.product.duration.toLocaleString("fa-IR")} روز
موجودی قابل فروش: ${detail.available.toLocaleString("fa-IR")}
فروخته‌شده: ${detail.sold.toLocaleString("fa-IR")}
اکانت فعال: ${detail.activeCount.toLocaleString("fa-IR")}
رزرو: ${detail.reserved.toLocaleString("fa-IR")} · غیرفعال: ${detail.disabled.toLocaleString("fa-IR")} · منقضی: ${detail.expired.toLocaleString("fa-IR")}
وضعیت: ${detail.product.isActive ? "فعال" : "غیرفعال"}`,
      keyboard: [
        [
          { text: "✏️ ویرایش", action: `flow:start:product_edit:${detail.product.id}` },
          { text: "📋 کپی محصول", action: `admin:product:duplicate:${detail.product.id}` },
        ],
        [
          { text: "🔐 افزودن اکانت", action: `flow:start:account_create:${detail.product.id}` },
          { text: "💰 تغییر قیمت", action: `flow:start:product_price:${detail.product.id}` },
        ],
        [{ text: "🗄 اکانت‌های محصول", action: callbackFor("admin.accounts", { productId: detail.product.id }) }],
        [
          {
            text: detail.product.isActive ? "غیرفعال‌سازی" : "فعال‌سازی",
            action: `admin:product:active:${detail.product.id}:${detail.product.isActive ? "0" : "1"}`,
          },
          { text: "🗑 حذف نرم", action: `admin:product:delete:${detail.product.id}` },
        ],
        [{ text: "🧨 حذف دائمی", action: `admin:product:hard_delete:confirm:${detail.product.id}` }],
      ],
    };
  });
  registerView("admin.categories", async (_ctx, params) => {
    const current = page(params);
    const [categories, total] = await AdminService.listCategories(current);
    return {
      text: `📂 مدیریت دسته‌بندی‌ها\n\nصفحه ${current.toLocaleString("fa-IR")} از ${pages(total, 8)}\n\n${categories.map((category) => `${category.icon ?? "📂"} ${category.name} · ${yesNo(category.isActive)} · محصول: ${category._count.products.toLocaleString("fa-IR")} · فعال: ${category.activeProductCount.toLocaleString("fa-IR")}`).join("\n") || "دسته‌بندی ثبت نشده است."}`,
      keyboard: [
        [{ text: "➕ دسته‌بندی جدید", action: "flow:start:category_create" }],
        ...categories.map((category) => [
          { text: `${category.icon ?? "📂"} مدیریت ${category.name}`, action: callbackFor("admin.category", { categoryId: category.id }) },
        ]),
        [
          { text: "◀️ قبلی", action: callbackFor("admin.categories", { page: Math.max(current - 1, 1) }) },
          { text: "بعدی ▶️", action: callbackFor("admin.categories", { page: current + 1 }) },
        ],
      ],
    };
  });

  registerView("admin.category", async (_ctx, params) => {
    const productPage = Math.max(Number(params.productPage ?? 1), 1);
    const detail = await AdminService.categoryDetail(params.categoryId, productPage, 6);

    if (!detail.category) {
      return { text: "⚠️ دسته‌بندی پیدا نشد.", keyboard: [] };
    }

    return {
      text: `${detail.category.icon ?? "📂"} ${detail.category.name}

توضیحات: ${detail.category.description ?? "—"}
ترتیب نمایش: ${detail.category.displayOrder.toLocaleString("fa-IR")}
وضعیت: ${yesNo(detail.category.isActive)}

📦 محصولات: ${detail.productCount.toLocaleString("fa-IR")}
✅ محصولات فعال: ${detail.activeProductCount.toLocaleString("fa-IR")}
🧾 فروش موفق: ${detail.salesCount.toLocaleString("fa-IR")}

محصولات این دسته:
${detail.products.map((product) => `• ${product.title} · ${product.isActive ? "فعال" : "غیرفعال"} · فروش ${product._count.orders.toLocaleString("fa-IR")}`).join("\n") || "محصولی در این دسته نیست."}`,
      keyboard: [
        [
          {
            text: "✏️ ویرایش",
            action: `flow:start:category_edit:${detail.category.id}`,
          },
          {
            text: detail.category.isActive ? "غیرفعال‌سازی" : "فعال‌سازی",
            action: `admin:category:status:${detail.category.id}:${detail.category.isActive ? "0" : "1"}`,
          },
        ],
        [
          {
            text: "🗑 حذف نرم",
            action: `admin:category:delete:${detail.category.id}`,
          },
          {
            text: "🧨 حذف دائمی",
            action: `admin:category:hard_delete:confirm:${detail.category.id}`,
          },
        ],
        [
          {
            text: "◀️ محصولات قبلی",
            action: callbackFor("admin.category", {
              categoryId: detail.category.id,
              productPage: Math.max(productPage - 1, 1),
            }),
          },
          {
            text: "محصولات بعدی ▶️",
            action: callbackFor("admin.category", {
              categoryId: detail.category.id,
              productPage: productPage + 1,
            }),
          },
        ],
        [
          {
            text: "📂 همه دسته‌بندی‌ها",
            action: callbackFor("admin.categories"),
          },
        ],
      ],
    };
  });
  registerView("admin.accounts", async (_ctx, params) => {
    const current = page(params);
    const status = ["available", "reserved", "sold", "disabled", "expired"].includes(params.status)
      ? (params.status as "available" | "reserved" | "sold" | "disabled" | "expired")
      : undefined;
    const productId = params.productId || undefined;
    const [accounts, total] = await AdminService.listAccounts(current, 8, undefined, status, productId);
    const stats = await AdminService.accountStats(productId);
    const products = stats.products.slice(0, 10);
    return {
      text: `🗄 مدیریت موجودی اکانت‌ها\n\nکل: ${stats.total.toLocaleString("fa-IR")} · آماده: ${stats.available.toLocaleString("fa-IR")} · رزرو: ${stats.reserved.toLocaleString("fa-IR")} · فروخته: ${stats.sold.toLocaleString("fa-IR")} · غیرفعال: ${stats.disabled.toLocaleString("fa-IR")} · منقضی: ${stats.expired.toLocaleString("fa-IR")}\n${status ? `\nفیلتر وضعیت: ${accountStatusLabel(status)}` : ""}\n\nصفحه ${current.toLocaleString("fa-IR")} از ${pages(total, 8)}\n\n${accounts.map((account) => `• ${account.username} · ${account.product.title}
  وضعیت: ${accountStatusLabel(account.status)}
  کاربر: ${account.assignedUser ? userLine(account.assignedUser) : "—"}
  تاریخ تخصیص: ${account.assignedDate ? account.assignedDate.toLocaleString("fa-IR") : "—"}`).join("\n") || "اکانتی ثبت نشده است."}`,
      keyboard: [
        [
          { text: "✅ آماده", action: callbackFor("admin.accounts", { status: "available", productId }) },
          { text: "⏳ رزرو", action: callbackFor("admin.accounts", { status: "reserved", productId }) },
          { text: "💰 فروخته", action: callbackFor("admin.accounts", { status: "sold", productId }) },
        ],
        [
          { text: "⏸ غیرفعال", action: callbackFor("admin.accounts", { status: "disabled", productId }) },
          { text: "⌛ منقضی", action: callbackFor("admin.accounts", { status: "expired", productId }) },
          { text: "نمایش همه", action: callbackFor("admin.accounts", { productId }) },
        ],
        ...accounts.map((account) => [{ text: `👁 ${account.username}`, action: callbackFor("admin.account", { accountId: account.id }) }]),
        ...products.map((product) => [{ text: `➕ افزودن به ${product.title}`, action: `flow:start:account_create:${product.id}` }]),
        [
          { text: "◀️ قبلی", action: callbackFor("admin.accounts", { page: Math.max(current - 1, 1), status, productId }) },
          { text: "بعدی ▶️", action: callbackFor("admin.accounts", { page: current + 1, status, productId }) },
        ],
      ],
    };
  });

  registerView("admin.account", async (_ctx, params) => {
    const account = await AdminService.accountDetail(params.accountId);
    if (!account) return { text: "⚠️ اکانت پیدا نشد.", keyboard: [] };
    const history =
      account.history
        .map((item) => `• ${item.createdAt.toLocaleString("fa-IR")} · ${item.action} · ${item.fromValue ?? "—"} ← ${item.toValue ?? "—"}`)
        .join("\n") || "تاریخچه‌ای ثبت نشده است.";
    return {
      text: `🗄 جزئیات اکانت

👤 نام کاربری: ${account.username}
📦 محصول: ${account.product.title}
📌 وضعیت: ${accountStatusLabel(account.status)}
👥 کاربر: ${account.assignedUser ? userLine(account.assignedUser) : "—"}
📅 تاریخ تخصیص: ${account.assignedDate ? account.assignedDate.toLocaleString("fa-IR") : "—"}

🔗 لینک اشتراک:
${account.subscriptionLink}

⚙️ کانفیگ:
${account.configLink}

📜 تاریخچه:
${history}`,
      keyboard: [
        [
          { text: "✏️ ویرایش", action: `flow:start:account_edit:${account.id}` },
          { text: "🚚 انتقال", action: callbackFor("admin.account.move", { accountId: account.id }) },
        ],
        [
          { text: "✅ آماده", action: `admin:account:status:${account.id}:available` },
          { text: "⏸ غیرفعال", action: `admin:account:status:${account.id}:disabled` },
          { text: "⌛ منقضی", action: `admin:account:status:${account.id}:expired` },
        ],
        [
          { text: "🗑 حذف", action: `admin:account:delete:confirm:${account.id}` },
          { text: "🗄 موجودی", action: callbackFor("admin.accounts") },
        ],
      ],
    };
  });

  registerView("admin.account.move", async (_ctx, params) => {
    const account = await AdminService.accountDetail(params.accountId);
    if (!account) return { text: "⚠️ اکانت پیدا نشد.", keyboard: [] };
    const products = await ProductService.listActiveProducts(50);
    return {
      text: `🚚 انتقال اکانت ${account.username}\n\nمحصول فعلی: ${account.product.title}\nمحصول مقصد را انتخاب کنید:`,
      keyboard: [
        ...products
          .filter((product) => product.id !== account.productId)
          .map((product) => [{ text: `${product.title} · ${product.category?.name ?? "دسته‌بندی نامعتبر یا حذف‌شده"}`, action: `admin:account:move_to:${account.id}:${product.id}` }]),
        [{ text: "↩️ بازگشت به اکانت", action: callbackFor("admin.account", { accountId: account.id }) }],
      ],
    };
  });

  registerView("admin.wallets", async (_ctx, params) => {
    const current = page(params);
    const [wallets, total] = await AdminService.listCryptoWallets(current);
    return {
      text: `💳 مدیریت کیف پول‌ها\n\nصفحه ${current.toLocaleString("fa-IR")} از ${pages(total, 8)}\n\n${wallets.map((wallet) => `• ${wallet.displayName ?? wallet.coinName} · ${wallet.networkName} · ${walletStatusLabel(wallet.status)}`).join("\n") || "کیف پولی ثبت نشده است."}`,
      keyboard: [
        [{ text: "➕ کیف پول جدید", action: "flow:start:crypto_wallet_create" }],
        ...wallets.map((wallet) => [
          { text: `👁 ${wallet.displayName ?? wallet.coinName}`, action: callbackFor("admin.wallet", { walletId: wallet.id }) },
        ]),
        [
          { text: "◀️ قبلی", action: callbackFor("admin.wallets", { page: Math.max(current - 1, 1) }) },
          { text: "بعدی ▶️", action: callbackFor("admin.wallets", { page: current + 1 }) },
        ],
      ],
    };
  });

  registerView("admin.wallet", async (_ctx, params) => {
    const detail = await AdminService.walletDetail(params.walletId);
    if (!detail.wallet) return { text: "⚠️ کیف پول پیدا نشد.", keyboard: [] };
    return {
      text: `💳 جزئیات کیف پول\n\nنام: ${detail.wallet.displayName ?? detail.wallet.coinName}\nنماد: ${detail.wallet.coinSymbol ?? detail.wallet.coinName}\nشبکه: ${detail.wallet.networkName}\nوضعیت: ${walletStatusLabel(detail.wallet.status)}\nترتیب: ${detail.wallet.displayOrder.toLocaleString("fa-IR")}\nنرخ: ${detail.wallet.rateToman > 0 ? money(detail.wallet.rateToman) : "—"}\nآخرین نرخ: ${detail.wallet.lastRateAt ? detail.wallet.lastRateAt.toLocaleString("fa-IR") : "—"}\n\nآدرس:\n${detail.wallet.walletAddress}\n\nپرداخت‌های فعال: ${detail.activePayments.toLocaleString("fa-IR")}\nواریزی‌های کل: ${detail.deposits.toLocaleString("fa-IR")}`,
      keyboard: [
        [
          { text: "✏️ ویرایش", action: `flow:start:crypto_wallet_edit:${detail.wallet.id}` },
          {
            text: detail.wallet.status === "active" ? "غیرفعال‌سازی" : "فعال‌سازی",
            action: `admin:wallet:status:${detail.wallet.id}:${detail.wallet.status === "active" ? "inactive" : "active"}`,
          },
        ],
        [
          { text: "🗑 حذف", action: `admin:wallet:delete:confirm:${detail.wallet.id}` },
          { text: "💳 همه کیف پول‌ها", action: callbackFor("admin.wallets") },
        ],
      ],
    };
  });

  registerView("admin.freeAccounts", async (_ctx, params) => {
    await FreeAccountService.expireDueAccounts();
    const current = page(params);
    const stats = await FreeAccountService.stats();
    const [inventory, total] = await FreeAccountService.listInventory(current, 8);
    return {
      text: `🆓 مدیریت اکانت تست

${divider}

📊 آمار اختصاصی اکانت تست

• کل اکانت‌ها: ${stats.total.toLocaleString("fa-IR")}
• موجودی آماده: ${stats.available.toLocaleString("fa-IR")}
• تخصیص‌یافته فعال: ${stats.assigned.toLocaleString("fa-IR")}
• منقضی‌شده: ${stats.expired.toLocaleString("fa-IR")}
• تخصیص‌های ۳۰ روز اخیر: ${stats.monthlyAssignments.toLocaleString("fa-IR")}
• کاربران یکتای سرویس‌گرفته: ${stats.uniqueUsers.toLocaleString("fa-IR")}

${divider}

🧾 آخرین تخصیص‌ها:
${stats.recentAssignments.map((item) => `• ${item.user.telegramId} ← ${item.account.username} · ${(item.assignedAt ?? item.createdAt).toLocaleDateString("fa-IR")} · انقضا ${(item.expiresAt ?? new Date((item.assignedAt ?? item.createdAt).getTime() + item.account.durationDays * 86_400_000)).toLocaleDateString("fa-IR")}`).join("\n") || "هنوز تخصیصی ثبت نشده است."}

📦 موجودی صفحه ${current.toLocaleString("fa-IR")} از ${pages(total, 8)}:
${inventory.map((item) => `• ${item.username} · ${item.durationDays.toLocaleString("fa-IR")} روز · ${FREE_ACCOUNT_STATUS_LABELS[item.status]}`).join("\n") || "موجودی ثبت نشده است."}`,
      keyboard: [
        [{ text: "➕ افزودن اکانت تست", action: "flow:start:free_account_create" }],
        ...inventory.map((item) => [
          { text: `👁 ${item.username} · ${FREE_ACCOUNT_STATUS_LABELS[item.status]}`, action: `admin:free_account:view:${item.id}` },
        ]),
        [
          { text: "◀️ قبلی", action: callbackFor("admin.freeAccounts", { page: Math.max(current - 1, 1) }) },
          { text: "بعدی ▶️", action: callbackFor("admin.freeAccounts", { page: current + 1 }) },
        ],
      ],
    };
  });

  registerView("admin.crypto", async () => {
    const stats = await AdminService.cryptoWalletStats();
    return {
      text: `⚙️ تنظیمات مالی و پرداخت

حداقل شارژ کیف پول: ${money(stats.setting.minimumTopupAmount)}
کیف پول‌های ثبت‌شده: ${stats.wallets.length.toLocaleString("fa-IR")}`,
      keyboard: [
        [{ text: "💳 مدیریت کیف پول‌ها", action: callbackFor("admin.wallets") }],
        [
          { text: "⚙️ حداقل شارژ", action: "flow:start:minimum_topup" },
          { text: "⚙️ وضعیت فروشگاه", action: callbackFor("admin.store") },
        ],
      ],
    };
  });

  registerView("admin.store", async () => {
    const stats = await AdminService.cryptoWalletStats();
    return {
      text: `⚙️ وضعیت فروشگاه\n\nوضعیت فعلی: ${stats.setting.storeStatus === "active" ? "فعال" : "غیرفعال"}\n\nدر حالت غیرفعال، کاربران عادی به خرید دسترسی ندارند اما مدیران همچنان می‌توانند عملیات را مدیریت کنند.`,
      keyboard: [
        [
          { text: "✅ فعال", action: "admin:store:status:active" },
          { text: "⛔ غیرفعال", action: "admin:store:status:inactive" },
        ],
      ],
    };
  });

  registerView("admin.forcedJoin", async () => {
    const channels = await AdminService.forcedJoinChannels();
    const activeCount = channels.filter((channel) => channel.status === "active").length;
    const inactiveCount = channels.length - activeCount;
    const channelLines = channels
      .map(
        (channel, index) => `• ${index + 1}. ${channel.title}
  شناسه: ${channel.chatId}
  وضعیت: ${channel.status === "active" ? "✅ فعال" : "⛔ غیرفعال"}
  لینک: ${channel.inviteLink || (channel.chatId.startsWith("@") ? `https://t.me/${channel.chatId.slice(1)}` : "ثبت نشده")}`,
      )
      .join("\n\n");

    return {
      text: `📢 مدیریت عضویت اجباری

کانال فعال: ${activeCount.toLocaleString("fa-IR")} · غیرفعال: ${inactiveCount.toLocaleString("fa-IR")}

${channelLines || "کانالی ثبت نشده است."}

کاربران بدون ارسال دوباره /start می‌توانند با دکمه «✅ عضو شدم» همان لحظه تایید شوند.`,
      keyboard: [
        [{ text: "➕ افزودن کانال", action: "flow:start:forced_join_create" }],
        ...channels.map((channel) => [
          {
            text: channel.status === "active" ? `غیرفعال‌سازی ${channel.title}` : `فعال‌سازی ${channel.title}`,
            action: `admin:forced_join:status:${channel.id}:${channel.status === "active" ? "inactive" : "active"}`,
          },
          { text: "🗑 حذف", action: `admin:forced_join:delete:${channel.id}` },
        ]),
      ],
    };
  });

  registerView("admin.referrals", async () => {
    const tiers = await ReferralService.listTiers();
    return {
      text: `🎁 مدیریت دعوت دوستان\n\n${tiers.map((tier) => `• ${tier.threshold.toLocaleString("fa-IR")} دعوت ← ${money(tier.amount)} · ${tier.isActive ? "فعال" : "غیرفعال"}`).join("\n") || "سطحی ثبت نشده است."}`,
      keyboard: [
        [{ text: "➕ سطح جدید/ویرایش", action: "flow:start:referral_tier_create" }],
        ...tiers.map((tier) => [
          {
            text: tier.isActive ? `غیرفعال‌سازی ${tier.threshold}` : `فعال‌سازی ${tier.threshold}`,
            action: `admin:referral:tier:status:${tier.id}:${tier.isActive ? "0" : "1"}`,
          },
          { text: `حذف ${tier.threshold}`, action: `admin:referral:tier:delete:${tier.id}` },
        ]),
      ],
    };
  });

  registerView("admin.analytics", async () => {
    const stats = await AdminService.dashboard(true);
    return {
      text: `📊 آمار عملیاتی\n\n💰 درآمد موفق: ${money(stats.revenue)}\n📦 اکانت آماده فروش: ${stats.availableAccounts.toLocaleString("fa-IR")}\n✅ اکانت فروخته‌شده: ${stats.soldAccounts.toLocaleString("fa-IR")}\n🎁 مجموع پاداش دعوت: ${money(stats.referralRewards)}\n🎁 اکانت تست تخصیص‌یافته: ${stats.freeAccountsAssigned.toLocaleString("fa-IR")}\n💳 واریزی در انتظار: ${stats.submittedDeposits.toLocaleString("fa-IR")}`,
      keyboard: [],
    };
  });

  registerView("admin.coupons", async (_ctx, params) => {
    const current = page(params);
    const [coupons, total] = await AdminService.listCoupons(current);
    return {
      text: `🎟 مدیریت کوپن‌ها\n\n${coupons.map((coupon) => `• ${coupon.code} · ${coupon.type === "percentage" ? `${(coupon.value || coupon.discountPercent || 0).toLocaleString("fa-IR")}%` : money(coupon.value)} · ${coupon.status} · ${coupon.usedCount.toLocaleString("fa-IR")}/${coupon.maxUses.toLocaleString("fa-IR")} · هر کاربر ${coupon.perUserLimit.toLocaleString("fa-IR")}`).join("\n") || "کوپنی ثبت نشده است."}\n\nصفحه ${current.toLocaleString("fa-IR")} از ${pages(total, 8)}`,
      keyboard: [
        [{ text: "➕ کوپن جدید", action: "flow:start:coupon_create" }],
        ...coupons.map((coupon) => [{ text: `مدیریت ${coupon.code}`, action: callbackFor("admin.coupon", { couponId: coupon.id }) }]),
        [
          { text: "◀️ قبلی", action: callbackFor("admin.coupons", { page: Math.max(current - 1, 1) }) },
          { text: "بعدی ▶️", action: callbackFor("admin.coupons", { page: current + 1 }) },
        ],
      ],
    };
  });

  registerView("admin.coupon", async (_ctx, params) => {
    const direct = await AdminService.couponDetail(params.couponId);
    if (!direct) return { text: "⚠️ کوپن پیدا نشد.", keyboard: [] };
    return {
      text: `🎟 جزئیات کوپن ${direct.code}\n\nنوع: ${direct.type === "percentage" ? "درصدی" : "مبلغ ثابت"}\nمقدار: ${direct.type === "percentage" ? `${(direct.value || direct.discountPercent || 0).toLocaleString("fa-IR")}%` : money(direct.value)}\nوضعیت: ${direct.status}\nمصرف: ${direct.usedCount.toLocaleString("fa-IR")}/${direct.maxUses.toLocaleString("fa-IR")}\nسقف هر کاربر: ${direct.perUserLimit.toLocaleString("fa-IR")}\nحداقل خرید: ${money(direct.minimumPurchaseAmount)}\nانقضا: ${direct.expiresAt.toLocaleDateString("fa-IR")}`,
      keyboard: [
        [
          { text: "✏️ ویرایش", action: `flow:start:coupon_edit:${direct.id}` },
          {
            text: direct.status === "active" ? "⛔ غیرفعال" : "✅ فعال",
            action: `admin:coupon:status:${direct.id}:${direct.status === "active" ? "inactive" : "active"}`,
          },
        ],
        [
          { text: "🗑 حذف نرم", action: `admin:coupon:soft_delete:${direct.id}` },
          { text: "🧨 حذف دائمی", action: `admin:coupon:hard_delete:${direct.id}` },
        ],
      ],
    };
  });

  registerView("admin.transactions", async () => {
    const stats = await AdminService.dashboard(true);
    return {
      text: `💰 تراکنش‌ها

واریزی‌های منتظر بررسی: ${stats.submittedDeposits.toLocaleString("fa-IR")}
سفارش‌ها: ${stats.orders.toLocaleString("fa-IR")}
درآمد موفق: ${money(stats.revenue)}

بخش موردنظر را انتخاب کنید:`,
      keyboard: [
        [
          { text: "💳 واریزی‌ها", action: callbackFor("admin.deposits") },
          { text: "🧾 سفارش‌ها", action: callbackFor("admin.orders") },
        ],
      ],
    };
  });
  registerView("admin.notifications", async () => {
    const [targets, recent] = await Promise.all([BroadcastService.targetStats(), BroadcastService.recent(5)]);

    const targetLines = targets.map((item) => `• ${item.label}: ${item.count.toLocaleString("fa-IR")} نفر`).join("\n");

    const recentLines =
      recent
        .map(
          (item) =>
            `• ${item.createdAt.toLocaleString("fa-IR")} · ${item.targetLabel}
  ارسال: ${item.sent.toLocaleString("fa-IR")} · تحویل: ${item.delivered.toLocaleString("fa-IR")} · ناموفق: ${item.failed.toLocaleString("fa-IR")}`,
        )
        .join("\n") || "هنوز اطلاع‌رسانی ثبت نشده است.";

    return {
      text: `📢 اطلاع‌رسانی همگانی

از این بخش می‌توانید پیام مدیریتی را برای گروه‌های مشخص ارسال کنید.

آمار مخاطبان:
${targetLines}

آخرین ارسال‌ها:
${recentLines}`,
      keyboard: [
        [
          {
            text: `📣 ${BROADCAST_TARGET_LABELS.all_users}`,
            action: "flow:start:broadcast_create:all_users",
          },
        ],
        [
          {
            text: `✅ ${BROADCAST_TARGET_LABELS.active_customers}`,
            action: "flow:start:broadcast_create:active_customers",
          },
          {
            text: `🕒 ${BROADCAST_TARGET_LABELS.inactive_customers}`,
            action: "flow:start:broadcast_create:inactive_customers",
          },
        ],
        [
          {
            text: `🗄 ${BROADCAST_TARGET_LABELS.users_with_active_accounts}`,
            action: "flow:start:broadcast_create:users_with_active_accounts",
          },
        ],
        [
          {
            text: `📭 ${BROADCAST_TARGET_LABELS.users_without_active_accounts}`,
            action: "flow:start:broadcast_create:users_without_active_accounts",
          },
        ],
      ],
    };
  });

  registerView("admin.settings", async () => {
    const stats = await AdminService.cryptoWalletStats();
    return {
      text: `⚙️ تنظیمات

وضعیت فروشگاه: ${stats.setting.storeStatus === "active" ? "فعال ✅" : "غیرفعال ⛔"}
حداقل شارژ کیف پول: ${money(stats.setting.minimumTopupAmount)}
کیف پول‌ها: ${stats.wallets.length.toLocaleString("fa-IR")}

بخش تنظیمات را انتخاب کنید:`,
      keyboard: [
        [
          { text: "🏪 وضعیت فروشگاه", action: callbackFor("admin.store") },
          { text: "💳 حداقل شارژ", action: "flow:start:minimum_topup" },
        ],
        [
          { text: "💳 کیف پول‌ها", action: callbackFor("admin.wallets") },
          { text: "⚙️ تنظیمات مالی", action: callbackFor("admin.crypto") },
        ],
        [{ text: "📢 عضویت اجباری", action: callbackFor("admin.forcedJoin") }],
      ],
    };
  });


  registerView("admin.paymentGateway", async () => {
    const [gateway, stats] = await Promise.all([PaymentGatewayService.getConfig(), PaymentInvoiceService.stats()]);
    const connectionLabel = gateway.lastConnectionStatus === "success" ? "موفق ✅" : gateway.lastConnectionStatus === "failed" ? "ناموفق ❌" : "تست نشده —";
    const lastTest = gateway.lastSuccessfulRequest && gateway.lastFailedRequest
      ? (gateway.lastSuccessfulRequest > gateway.lastFailedRequest ? gateway.lastSuccessfulRequest : gateway.lastFailedRequest)
      : gateway.lastSuccessfulRequest ?? gateway.lastFailedRequest;
    return {
      replyKeyboard: "admin",
      text: `⚡ مدیریت پرداخت آنی

${divider}

وضعیت:
${gateway.enabled ? "فعال ✅" : "غیرفعال ⛔"}

نام درگاه:
${gateway.gatewayName}

آدرس اتصال درگاه:
${gateway.apiBaseUrl || "—"}

آدرس بازگشت پرداخت:
${gateway.callbackUrl || "—"}

کلید اتصال:
${maskApiKey(gateway.apiKey)}

ترتیب نمایش:
${gateway.displayOrder.toLocaleString("fa-IR")}

${divider}

📡 اتصال:
${connectionLabel}

آخرین تست:
${lastTest ? lastTest.toLocaleString("fa-IR") : "—"}
${gateway.lastConnectionError ? `
آخرین خطا:
نیازمند بررسی تنظیمات درگاه است.` : ""}

${divider}

📊 فاکتورها

کل فاکتورها:
${stats.total.toLocaleString("fa-IR")}

تکمیل‌شده:
${stats.successful.toLocaleString("fa-IR")}

پرداخت‌شده در انتظار تحویل:
${stats.paid.toLocaleString("fa-IR")}

ناموفق:
${stats.failed.toLocaleString("fa-IR")}

در انتظار:
${stats.pending.toLocaleString("fa-IR")}

لغوشده:
${stats.cancelled.toLocaleString("fa-IR")}

درآمد امروز:
${money(stats.todayRevenue)}

درآمد ۷ روز اخیر:
${money(stats.weeklyRevenue)}

درآمد ماه جاری:
${money(stats.monthlyRevenue)}`,
      keyboard: [
        [{ text: gateway.enabled ? "⏸ فعال/غیرفعال: غیرفعال‌سازی" : "▶️ فعال/غیرفعال: فعال‌سازی", action: `admin:payment_gateway:status:${gateway.enabled ? "disabled" : "enabled"}` }],
        [
          { text: "🏷 نام درگاه", action: "flow:start:payment_gateway_update:gatewayName" },
          { text: "🌐 آدرس اتصال درگاه", action: "flow:start:payment_gateway_update:apiBaseUrl" },
        ],
        [
          { text: "🔑 کلید اتصال", action: "flow:start:payment_gateway_update:apiKey" },
          { text: "🔗 آدرس بازگشت پرداخت", action: "flow:start:payment_gateway_update:callbackUrl" },
        ],
        [{ text: "💾 ذخیره تنظیمات: هر فیلد جداگانه", action: "flow:start:payment_gateway_update:gatewayName" }],
        [{ text: "🧭 راه‌اندازی مرحله‌ای", action: "flow:start:payment_gateway_setup" }],
        [{ text: "📡 تست اتصال", action: "admin:payment_gateway:test" }],
        [{ text: "🧾 مشاهده فاکتورها", action: callbackFor("admin.invoices") }, { text: "📊 آمار پرداخت‌ها", action: callbackFor("admin.paymentStats") }],
        [{ text: "🏠 بازگشت", action: callbackFor("admin.dashboard") }],
      ],
    };
  });

  registerView("admin.paymentStats", async () => {
    const stats = await PaymentInvoiceService.stats();
    return {
      text: `📊 آمار پرداخت آنی

${divider}
🧾 کل: ${stats.total.toLocaleString("fa-IR")}
✅ تکمیل‌شده: ${stats.successful.toLocaleString("fa-IR")}
💳 پرداخت‌شده/در انتظار تحویل: ${stats.paid.toLocaleString("fa-IR")}
❌ ناموفق: ${stats.failed.toLocaleString("fa-IR")}
⏳ در انتظار: ${stats.pending.toLocaleString("fa-IR")}
🚫 لغوشده: ${stats.cancelled.toLocaleString("fa-IR")}

💰 درآمد امروز: ${money(stats.todayRevenue)}
📆 درآمد ۷ روز اخیر: ${money(stats.weeklyRevenue)}
🗓 درآمد ماه جاری: ${money(stats.monthlyRevenue)}
📡 وضعیت درگاه: ${stats.gatewayStatus}

آخرین فاکتورها:
${stats.recent.map((invoice) => `• #${shortId(invoice.id)} · ${invoice.user.telegramId} · ${paymentStatusLabel(invoice.status)} · ${money(invoice.amount)}`).join("\n") || "فاکتور پرداختی ثبت نشده است."}`,
      keyboard: [[{ text: "⚡ مدیریت پرداخت آنی", action: callbackFor("admin.paymentGateway") }]],
    };
  });

  registerView("admin.invoices", async (_ctx, params) => {
    const current = page(params);
    const paymentStatuses: PaymentInvoiceStatus[] = ["PENDING", "PAID", "COMPLETED", "CANCELED", "FAILED"];
    const status = paymentStatuses.includes(params.status as PaymentInvoiceStatus) ? params.status as PaymentInvoiceStatus : undefined;
    const [invoices, total] = await PaymentInvoiceService.list(current, 8, status);
    const statusLabel = paymentStatusLabel;
    const typeLabel = (value: string) => value === "WALLET_TOPUP" ? "شارژ کیف پول" : "خرید محصول";
    return {
      text: `🧾 فاکتورهای پرداخت

صفحه ${current.toLocaleString("fa-IR")} از ${pages(total, 8)}
${status ? `
فیلتر: ${statusLabel(status)}` : "\nفیلتر: همه"}

${invoices.map((invoice) => `• شناسه: #${shortId(invoice.id)}
  شناسه پرداخت: ${invoice.payId ?? "—"}
  کاربر: ${invoice.user.telegramId}
  مبلغ: ${money(invoice.amount)}
  نوع: ${typeLabel(invoice.type)}
  وضعیت: ${statusLabel(invoice.status)}
  ایجاد: ${invoice.createdAt.toLocaleString("fa-IR")}
  پرداخت: ${invoice.paidAt ? invoice.paidAt.toLocaleString("fa-IR") : "—"}`).join("\n\n") || "فاکتوری ثبت نشده است."}`,
      keyboard: [
        [
          { text: "همه", action: callbackFor("admin.invoices") },
          { text: "در انتظار", action: callbackFor("admin.invoices", { status: "PENDING" }) },
        ],
        [
          { text: "پرداخت شده", action: callbackFor("admin.invoices", { status: "PAID" }) },
          { text: "تکمیل‌شده", action: callbackFor("admin.invoices", { status: "COMPLETED" }) },
          { text: "لغو شده", action: callbackFor("admin.invoices", { status: "CANCELED" }) },
          { text: "ناموفق", action: callbackFor("admin.invoices", { status: "FAILED" }) },
        ],
        ...invoices.map((invoice) => [{ text: `👁 #${shortId(invoice.id)}`, action: callbackFor("admin.invoice", { invoiceId: invoice.id }) }]),
        [
          { text: "◀️ قبلی", action: callbackFor("admin.invoices", { page: Math.max(current - 1, 1), status }) },
          { text: "بعدی ▶️", action: callbackFor("admin.invoices", { page: current + 1, status }) },
        ],
      ],
    };
  });

  registerView("admin.invoice", async (_ctx, params) => {
    const invoice = await PaymentInvoiceService.detail(params.invoiceId);
    if (!invoice) return { text: "⚠️ فاکتور پرداخت پیدا نشد.", keyboard: [] };
    return {
      text: `🧾 جزئیات فاکتور پرداخت

شناسه فاکتور: ${invoice.id}
شناسه پرداخت: ${invoice.payId ?? "—"}
کاربر: ${invoice.user.telegramId}
نوع: ${invoice.type === "WALLET_TOPUP" ? "شارژ کیف پول" : "خرید محصول"}
وضعیت: ${paymentStatusLabel(invoice.status)}
مبلغ اصلی: ${money(invoice.originalAmount)}
مقدار تخفیف: ${money(invoice.discountAmount)}
کد تخفیف: ${invoice.couponCode ?? invoice.coupon?.code ?? "—"}
مبلغ نهایی: ${money(invoice.amount)}
مبلغ ثبت‌شده درگاه: ${invoice.gatewayAmount ? money(invoice.gatewayAmount) : "—"}
نوع پرداخت: ${invoice.type === "WALLET_TOPUP" ? "پرداخت آنی / شارژ کیف پول" : "پرداخت آنی / خرید محصول"}
محصول: ${invoice.product?.title ?? "—"}
سفارش: ${invoice.orderId ?? "—"}
زمان ایجاد: ${invoice.createdAt.toLocaleString("fa-IR")}
زمان پرداخت: ${invoice.paidAt ? invoice.paidAt.toLocaleString("fa-IR") : "—"}
زمان تکمیل: ${invoice.completedAt ? invoice.completedAt.toLocaleString("fa-IR") : "—"}
تعداد بازگشت پرداخت: ${invoice.callbackCount.toLocaleString("fa-IR")}
آخرین بازگشت پرداخت: ${invoice.lastCallbackAt ? invoice.lastCallbackAt.toLocaleString("fa-IR") : "—"}
وضعیت تحویل: ${invoice.orderId ? "تکمیل شده" : "در انتظار"}
وضعیت اطلاع‌رسانی: ${invoice.notificationStatus ? "ثبت شده" : "—"}

سوابق پرداخت:
${invoice.audits.map((audit) => `• ${audit.createdAt.toLocaleString("fa-IR")} · رویداد ثبت شد`).join("\n") || "رخدادی ثبت نشده است."}`,
      keyboard: [[{ text: "🧾 همه فاکتورها", action: callbackFor("admin.invoices") }]],
    };
  });

  registerView("admin.deposits", async (_ctx, params) => {
    const current = page(params);
    const [deposits, total] = await AdminService.listSubmittedDeposits(current);
    return {
      text: `💰 مدیریت واریزی‌ها\n\nصفحه ${current.toLocaleString("fa-IR")} از ${pages(total, 8)}`,
      keyboard: deposits.map((deposit) => [
        { text: `💳 ${deposit.user.telegramId} · ${money(deposit.amount)}`, action: callbackFor("admin.deposit", { depositId: deposit.id }) },
      ]),
    };
  });

  registerView("admin.deposit", async (_ctx, params) => {
    const deposit = await AdminService.depositDetail(params.depositId);
    if (!deposit) return { text: "⚠️ واریزی پیدا نشد.", keyboard: [] };
    return {
      text: `💳 جزئیات واریزی\n\nکاربر: ${deposit.user.telegramId}\nمبلغ: ${money(deposit.amount)}\nارز: ${deposit.cryptoType.toUpperCase()}\nوضعیت: ${deposit.status}\nرسید: ${deposit.receipt ? "ثبت شده" : "ثبت نشده"}`,
      keyboard: [
        [
          { text: "✅ تأیید", action: `admin:deposit:approve:${deposit.id}` },
          { text: "❌ رد", action: `admin:deposit:reject:${deposit.id}` },
        ],
      ],
    };
  });

  registerView("admin.orders", async (_ctx, params) => {
    const current = page(params);
    const [orders, total] = await AdminService.listRecentOrders(current);
    return {
      text: `🧾 سفارش‌ها\n\n${orders.map((order) => `• #${shortId(order.id)} · ${order.user.telegramId} · ${order.product.title} · ${money(order.totalAmount)}`).join("\n") || "سفارشی ثبت نشده است."}\n\nصفحه ${current.toLocaleString("fa-IR")} از ${pages(total, 8)}`,
      keyboard: [
        [
          { text: "◀️ قبلی", action: callbackFor("admin.orders", { page: Math.max(current - 1, 1) }) },
          { text: "بعدی ▶️", action: callbackFor("admin.orders", { page: current + 1 }) },
        ],
      ],
    };
  });

  registerView("admin.tickets", async (_ctx, params) => {
    const current = page(params);
    const [tickets, total] = await AdminService.listTickets(current);
    const openCount = tickets.filter((ticket) => ticket.status === "open").length;
    return {
      text: `🎫 مدیریت تیکت‌ها
${divider}

📌 تاریخچه گفتگوها، ورود مستقیم به چت و بستن تیکت‌ها از همین بخش انجام می‌شود.

✅ تیکت‌های باز این صفحه: ${openCount.toLocaleString("fa-IR")}
📄 صفحه ${current.toLocaleString("fa-IR")} از ${pages(total, 8)}`,
      keyboard: [
        ...tickets.map((ticket) => [
          {
            text: `${ticket.status === "open" ? "🟢" : "⚫️"} ${ticket.user.telegramId} · #${shortId(ticket.id)}`,
            action: callbackFor("admin.ticket", { ticketId: ticket.id }),
          },
        ]),
        [
          { text: "◀️ قبلی", action: callbackFor("admin.tickets", { page: Math.max(current - 1, 1) }) },
          { text: "بعدی ▶️", action: callbackFor("admin.tickets", { page: current + 1 }) },
        ],
      ],
    };
  });

  registerView("admin.ticket", async (_ctx, params) => {
    const ticket = await SupportService.getTicketWithUser(params.ticketId);
    if (!ticket) return { text: "⚠️ تیکت پیدا نشد.", keyboard: [] };
    const statusAction =
      ticket.status === "open"
        ? { text: "✅ بستن", action: `admin:ticket:close:${ticket.id}` }
        : { text: "🔄 باز کردن مجدد", action: `admin:ticket:reopen:${ticket.id}` };
    return {
      text: `🎫 تیکت #${shortId(ticket.id)}
${divider}

👤 کاربر: ${ticket.user.telegramId}${ticket.user.username ? ` (@${ticket.user.username})` : ""}
⚡ وضعیت: ${ticket.status === "open" ? "باز ✅" : "بسته 🔒"}
🕒 آخرین بروزرسانی: ${ticket.updatedAt.toLocaleString("fa-IR")}

${
  ticket.messages
    .map(
      (message) => `${message.senderRole === "admin" ? "👨‍💼 پشتیبانی" : "👤 کاربر"} · ${message.createdAt.toLocaleString("fa-IR")}
${message.message}`,
    )
    .join("\n\n") || "بدون پیام"
}`,
      keyboard: [
        [
          { text: "💬 ورود به چت", action: `support:admin:chat:${ticket.id}` },
          { text: "↩️ پاسخ سریع", action: `flow:start:ticket_reply:${ticket.id}` },
        ],
        [statusAction],
      ],
    };
  });
}
