import { registerView, callbackFor, type UiKeyboard } from "../navigation/panel-ui";
import { isAdminByTelegramId } from "../middlewares/admin.middleware";
import { UserService } from "../../modules/user/user.service";
import { ProductService } from "../../modules/product/product.service";
import { AdminService } from "../../modules/admin/admin.service";
import { ReferralService } from "../../modules/referral/referral.service";
import { FreeAccountService, FREE_ACCOUNT_STATUS_LABELS, formatFreeAccountDate, freeAccountExpiresAt } from "../../modules/free-account/free-account.service";
import { SupportService } from "../../modules/support/support.service";

const divider = "━━━━━━━━━━━━━━";
const money = (value: number) => `${value.toLocaleString("fa-IR")} تومان`;
const page = (params: Record<string, string>) => Math.max(Number(params.page ?? 1), 1);
const pages = (total: number, take: number) => Math.max(Math.ceil(total / take), 1).toLocaleString("fa-IR");
const userLine = (user: { telegramId: string; username?: string | null; firstName?: string | null }) => `${user.firstName ?? "کاربر"} ${user.username ? `@${user.username}` : user.telegramId}`;
const stockLabel = (count: number) => (count > 5 ? "آماده تحویل" : count > 0 ? `فقط ${count.toLocaleString("fa-IR")} عدد` : "ناموجود");
const shortId = (id: string) => id.slice(-6).toUpperCase();
const freeAccountExpiry = (item: { assignedAt?: Date | null; createdAt: Date; expiresAt?: Date | null; account: { durationDays: number } }) => item.expiresAt ?? freeAccountExpiresAt(item.assignedAt ?? item.createdAt, item.account.durationDays);

export function registerModernViews() {
  registerView("home", async (ctx) => {
    const user = ctx.from ? await UserService.findOrCreateUser(ctx) : undefined;
    const isAdmin = ctx.from ? await isAdminByTelegramId(ctx.from.id) : false;
    const featured = await ProductService.listFeaturedProducts(4);
    const dashboard = user ? await UserService.dashboard(user.id) : undefined;
    const featuredKeyboard = featured.map((product) => [
      { text: `🛒 ${product.title} · ${money(product.price)}`, action: callbackFor("shop.product", { productId: product.id }) },
    ]);
    const keyboard: UiKeyboard = [
      ...featuredKeyboard,
      [{ text: "🔎 جستجوی محصول", action: "flow:start:product_search" }, { text: "🛍 همه محصولات", action: callbackFor("shop.categories") }],
      [{ text: "💳 شارژ کیف پول", action: callbackFor("deposit") }, { text: "📦 اکانت‌های من", action: callbackFor("account.details") }],
      [{ text: "🆓 دریافت اکانت تست", action: callbackFor("freeAccount") }, { text: "🎁 دعوت دوستان", action: callbackFor("referral") }],
      [{ text: "🎫 پشتیبانی", action: callbackFor("support") }, { text: "⚙️ حساب کاربری", action: callbackFor("account") }],
    ];
    if (isAdmin) keyboard.push([{ text: "⚙️ مرکز مدیریت", action: callbackFor("admin.dashboard") }]);

    return {
      text: `سلام ${ctx.from?.first_name ?? "دوست عزیز"} 🌿\n\n${divider}\n👤 پروفایل کاربر\n\n💰 موجودی کیف پول: ${money(user?.balance ?? 0)}\n👥 تعداد دعوت‌ها: ${(dashboard?.referralCount ?? 0).toLocaleString("fa-IR")} نفر\n🎁 جوایز فعال: ${(dashboard?.freeRewards ?? 0).toLocaleString("fa-IR")}\n📦 اکانت‌های فعال: ${((dashboard?.activeAccounts.length ?? 0) + (dashboard?.activeFreeAccounts.length ?? 0)).toLocaleString("fa-IR")}\n${divider}\n\n✨ سرویس‌های منتخب آماده تحویل هستند. برای خرید سریع، یکی از گزینه‌های زیر را انتخاب کنید.`,
      keyboard,
    };
  });

  registerView("shop.categories", async () => {
    const categories = await ProductService.getCategories();
    return {
      text: `🛍 فروشگاه نیمه‌شب\n\n${divider}\nبرای خرید سریع، دسته‌بندی موردنظر را انتخاب کنید. همه سرویس‌های نمایش‌داده‌شده موجود و آماده تحویل خودکار هستند.`,
      keyboard: [
        [{ text: "🔎 جستجوی محصول", action: "flow:start:product_search" }],
        ...categories.map((category) => [{ text: `📁 ${category.name} (${category.products.length.toLocaleString("fa-IR")})`, action: callbackFor("shop.products", { categoryId: category.id }) }]),
      ],
    };
  });

  registerView("shop.products", async (_ctx, params) => {
    const products = await ProductService.getProductsByCategory(params.categoryId);
    return {
      text: `📦 انتخاب سرویس\n\n${divider}\nیک سرویس را انتخاب کنید تا پیش‌فاکتور و جزئیات تحویل را ببینید.`,
      keyboard: products.map((product) => [{ text: `${product.title} · ${money(product.price)} · ${stockLabel(product._count.accounts)}`, action: callbackFor("shop.product", { productId: product.id }) }]),
    };
  });

  registerView("shop.searchResults", async (ctx, params) => {
    const query = params.q || ctx.session.productSearchQuery || "";
    const products = await ProductService.searchActiveProducts(query, 10);
    return {
      text: `🔎 نتیجه جستجو\n\nعبارت: ${query || "—"}\n${divider}\n${products.length ? "محصول موردنظر را انتخاب کنید:" : "موردی پیدا نشد. نام سرویس یا دسته‌بندی را کوتاه‌تر وارد کنید."}`,
      keyboard: [
        ...products.map((product) => [{ text: `${product.title} · ${money(product.price)} · ${product.category.name}`, action: callbackFor("shop.product", { productId: product.id }) }]),
        [{ text: "🔎 جستجوی جدید", action: "flow:start:product_search" }],
      ],
    };
  });

  registerView("shop.product", async (ctx, params) => {
    const product = await ProductService.getProduct(params.productId);
    if (!product) return { text: "⚠️ این محصول در حال حاضر در دسترس نیست.", keyboard: [] };
    const stock = await ProductService.availableStock(product.id);
    ctx.session.recentlyViewedProductIds = [product.id, ...(ctx.session.recentlyViewedProductIds ?? []).filter((id) => id !== product.id)].slice(0, 6);
    const isFavorite = Boolean(ctx.session.favoriteProducts?.[product.id]);
    return {
      text: `📦 ${product.title}\n\n${divider}\n🏷 دسته‌بندی: ${product.category.name}\n📅 اعتبار سرویس: ${product.duration.toLocaleString("fa-IR")} روز\n💰 قیمت نهایی: ${money(product.price)}\n🚀 تحویل: فوری و خودکار\n📊 موجودی: ${stockLabel(stock)}\n${divider}\n\nپس از پرداخت، اطلاعات اکانت در همین پیام و بخش «اکانت‌های من» نمایش داده می‌شود.`,
      keyboard: [
        [{ text: "🛒 خرید فوری", action: callbackFor("shop.checkout", { productId: product.id }) }],
        [{ text: isFavorite ? "💛 حذف از علاقه‌مندی" : "🤍 افزودن به علاقه‌مندی", action: `favorite:toggle:${product.id}` }, { text: "🎟 کد تخفیف", action: `flow:start:coupon_code:${product.id}` }],
      ],
    };
  });

  registerView("shop.checkout", async (ctx, params) => {
    const user = ctx.from ? await UserService.getByTelegramId(ctx.from.id) : undefined;
    const product = await ProductService.getProduct(params.productId);
    if (!product || !user) return { text: "⚠️ اطلاعات خرید کامل نیست. لطفاً دوباره از فروشگاه اقدام کنید.", keyboard: [] };
    const coupon = ctx.session.selectedCoupons?.[product.id];
    const shortage = Math.max(product.price - user.balance, 0);
    return {
      text: `🧾 پیش‌فاکتور خرید\n\n${divider}\n📦 محصول: ${product.title}\n📅 اعتبار: ${product.duration.toLocaleString("fa-IR")} روز\n💰 مبلغ سفارش: ${money(product.price)}\n🎟 کد تخفیف: ${coupon ?? "ثبت نشده"}\n💳 موجودی کیف پول: ${money(user.balance)}\n${shortage ? `\n⚠️ کسری موجودی: ${money(shortage)}` : "\n✅ موجودی شما برای خرید کافی است."}\n${divider}\n\nبا تأیید، مبلغ به‌صورت امن از کیف پول کسر و اکانت فوراً تخصیص داده می‌شود.`,
      keyboard: [
        [{ text: "✅ تأیید و دریافت اکانت", action: `buy:confirm:${product.id}` }],
        [{ text: "💳 شارژ کیف پول", action: callbackFor("deposit") }, { text: "🎟 کد تخفیف", action: `flow:start:coupon_code:${product.id}` }],
      ],
    };
  });

  registerView("account", async (ctx) => {
    const user = ctx.from ? await UserService.getByTelegramId(ctx.from.id) : undefined;
    if (!user) return { text: "⚠️ پروفایل شما پیدا نشد. لطفاً /start را ارسال کنید.", keyboard: [] };
    const dashboard = await UserService.dashboard(user.id);
    return {
      text: `👤 داشبورد حساب کاربری\n\n${divider}\n💰 موجودی کیف پول: ${money(dashboard.user.balance)}\n👥 تعداد دعوت‌ها: ${dashboard.referralCount.toLocaleString("fa-IR")} نفر\n🎁 جوایز فعال: ${dashboard.freeRewards.toLocaleString("fa-IR")}\n📦 اکانت‌های فعال: ${(dashboard.activeAccounts.length + dashboard.activeFreeAccounts.length).toLocaleString("fa-IR")}\n🧾 خریدهای اخیر: ${dashboard.recentOrders.length.toLocaleString("fa-IR")} سفارش\n💎 پاداش قابل برداشت: ${money(dashboard.pendingReferralAmount)}\n${divider}\n\nاقدام سریع خود را انتخاب کنید:`,
      keyboard: [
        [{ text: "💳 شارژ کیف پول", action: callbackFor("deposit") }, { text: "🛒 فروشگاه", action: callbackFor("shop.categories") }],
        [{ text: "🎁 دعوت دوستان", action: callbackFor("referral") }, { text: "📦 اکانت‌های من", action: callbackFor("account.details") }],
        [{ text: "🧾 خریدها", action: callbackFor("account.history") }, { text: "📜 گردش کیف پول", action: callbackFor("wallet.history") }],
      ],
    };
  });

  registerView("account.details", async (ctx) => {
    const user = ctx.from ? await UserService.getByTelegramId(ctx.from.id) : undefined;
    if (!user) return { text: "⚠️ پروفایل شما پیدا نشد. لطفاً /start را ارسال کنید.", keyboard: [] };
    await FreeAccountService.expireDueAccounts();
    const dashboard = await UserService.dashboard(user.id);
    const activeFreeAccounts = await FreeAccountService.assignedForUser(user.id, true);
    return {
      text: `📦 اکانت‌های من

${divider}

${[...activeFreeAccounts.map((item) => `🆓 اکانت تست رایگان

👤 نام کاربری:
${item.account.username}

🔗 لینک اشتراک:
${item.account.subscriptionLink}

⚙️ لینک کانفیگ:
${item.account.configLink}

📅 تاریخ انقضا:
${freeAccountExpiry(item).toLocaleDateString("fa-IR")}

📌 وضعیت:
فعال و قابل استفاده`), ...dashboard.activeAccounts.map((item) => `🛒 خریداری شده
📦 ${item.product.title}

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
فعال`)].join(`

${divider}

`) || "اکانت فعالی برای نمایش وجود ندارد. از فروشگاه می‌توانید سرویس جدید تهیه کنید یا اکانت تست دریافت کنید."}

${divider}`,
      keyboard: [[{ text: "🛒 خرید سرویس", action: callbackFor("shop.categories") }, { text: "🆓 اکانت تست", action: callbackFor("freeAccount") }], [{ text: "🎧 پشتیبانی", action: callbackFor("support") }]],
    };
  });

  registerView("account.history", async (ctx) => {
    const user = ctx.from ? await UserService.getByTelegramId(ctx.from.id) : undefined;
    if (!user) return { text: "⚠️ پروفایل شما پیدا نشد.", keyboard: [] };
    const dashboard = await UserService.dashboard(user.id);
    return { text: `🧾 تاریخچه خرید\n\n${dashboard.recentOrders.map((order) => `• #${shortId(order.id)} · ${order.product.title}\n  مبلغ: ${money(order.finalPaidAmount)} · تاریخ: ${order.createdAt.toLocaleDateString("fa-IR")}`).join("\n") || "هنوز خریدی ثبت نشده است."}\n\n⏳ اکانت‌های منقضی‌شده: ${dashboard.expiredAccounts.length.toLocaleString("fa-IR")}`, keyboard: [[{ text: "🛒 خرید جدید", action: callbackFor("shop.categories") }]] };
  });

  registerView("wallet", async (ctx) => {
    const user = ctx.from ? await UserService.getByTelegramId(ctx.from.id) : undefined;
    return { text: `💳 کیف پول\n\n${divider}\nموجودی قابل استفاده: ${money(user?.balance ?? 0)}\n\nشارژ کیف پول از طریق پرداخت رمزارزی انجام می‌شود و پس از تأیید رسید، موجودی شما به‌روزرسانی خواهد شد.`, keyboard: [[{ text: "➕ شارژ کیف پول", action: callbackFor("deposit") }, { text: "📜 گردش کیف پول", action: callbackFor("wallet.history") }]] };
  });

  registerView("wallet.history", async (ctx) => {
    const user = ctx.from ? await UserService.getByTelegramId(ctx.from.id) : undefined;
    if (!user) return { text: "⚠️ پروفایل شما پیدا نشد.", keyboard: [] };
    const dashboard = await UserService.dashboard(user.id);
    return { text: `📜 گردش کیف پول\n\n${dashboard.walletTransactions.map((tx) => `${tx.type === "credit" || tx.type === "transfer_in" ? "🟢" : "🔴"} ${tx.description}\n${money(tx.amount)} · ${tx.createdAt.toLocaleString("fa-IR")}`).join("\n\n") || "هنوز تراکنشی ثبت نشده است."}`, keyboard: [[{ text: "➕ شارژ کیف پول", action: callbackFor("deposit") }]] };
  });

  registerView("deposit", async () => ({ text: `➕ شارژ کیف پول\n\n${divider}\nمبلغ شارژ را به تومان وارد می‌کنید، سپس شبکه پرداخت را انتخاب و رسید را ارسال می‌کنید.\n\n⏳ درخواست‌ها زمان‌دار هستند تا پرداخت‌ها دقیق و قابل پیگیری بمانند.`, keyboard: [[{ text: "💳 شروع شارژ", action: "flow:start:deposit_submit" }]] }));

  registerView("support", async (ctx) => {
    const user = ctx.from ? await UserService.getByTelegramId(ctx.from.id) : undefined;
    if (!user) return { text: "⚠️ پروفایل شما پیدا نشد. لطفاً /start را ارسال کنید.", keyboard: [] };
    const tickets = await SupportService.listUserTickets(user.id);
    const latestOpen = tickets.find((ticket) => ticket.status === "open");
    return {
      text: `🎫 پشتیبانی حرفه‌ای

${divider}

💬 برای گفتگوی طبیعی با پشتیبانی، وارد چت شوید و هر تعداد پیام لازم است ارسال کنید. پاسخ‌ها در همین گفتگو برای شما ارسال می‌شود.

📌 وضعیت آخرین تیکت: ${latestOpen ? `باز (#${shortId(latestOpen.id)})` : "تیکت باز ندارید"}

${tickets.map((ticket) => `• #${shortId(ticket.id)} · ${ticket.status === "open" ? "باز ✅" : "بسته 🔒"} · ${ticket.updatedAt.toLocaleString("fa-IR")}
  ${ticket.messages[0]?.message ?? "بدون پیام"}`).join("\n") || "هنوز تیکتی ثبت نشده است."}`,
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
    return { text: `🎁 دعوت دوستان\n\n${divider}\nکد دعوت شما:\n${user.referralCode ?? "در حال ساخت"}\n\nلینک دعوت آماده کپی:\n${link}\n\n👥 دعوت‌های موفق: ${stats.totalReferrals.toLocaleString("fa-IR")} نفر\n💰 پاداش قابل برداشت: ${money(stats.pendingAmount)}\n${divider}\n\nاین لینک را برای دوستانتان ارسال کنید؛ بعد از ثبت‌نام موفق، پاداش شما به‌صورت شفاف در همین بخش نمایش داده می‌شود.`, keyboard: [[{ text: "💰 برداشت پاداش", action: "referral:claim" }]] };
  });

  registerView("freeAccount", async (ctx) => {
    const user = ctx.from ? await UserService.getByTelegramId(ctx.from.id) : undefined;
    if (!user) return { text: "⚠️ پروفایل شما پیدا نشد. لطفاً /start را ارسال کنید.", keyboard: [] };
    const eligibility = await FreeAccountService.eligibility(user.id);
    if (eligibility.reason === "active") {
      return {
        text: `⚠️ اکانت تست فعال دارید

${divider}

شما در حال حاضر یک اکانت تست فعال در اختیار دارید.

برای مشاهده اطلاعات اکانت از بخش «اکانت‌های من» استفاده کنید.

${divider}`,
        keyboard: [[{ text: "📦 اکانت‌های من", action: callbackFor("account.details") }], [{ text: "🏠 منوی اصلی", action: callbackFor("home") }]],
      };
    }
    if (eligibility.reason === "cooldown") {
      const lastClaimAt = eligibility.last?.assignedAt ?? eligibility.last?.createdAt;
      return {
        text: `⏳ محدودیت دریافت اکانت تست

${divider}

شما در ۳۰ روز گذشته اکانت تست دریافت کرده‌اید.

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
        text: `⚠️ دسترسی محدود شده است

${divider}

امکان دریافت اکانت تست برای حساب شما در حال حاضر فعال نیست.

برای بررسی بیشتر می‌توانید با پشتیبانی در ارتباط باشید.

${divider}`,
        keyboard: [[{ text: "🎧 پشتیبانی", action: callbackFor("support") }], [{ text: "🏠 منوی اصلی", action: callbackFor("home") }]],
      };
    }
    if (!eligibility.available) {
      return {
        text: `🚫 موجودی اکانت تست تکمیل شده است

${divider}

در حال حاضر تمامی اکانت‌های تست تخصیص داده شده‌اند.

لطفاً بعداً مجدداً مراجعه کنید.

${divider}`,
        keyboard: [[{ text: "🏠 منوی اصلی", action: callbackFor("home") }]],
      };
    }
    return {
      text: `🆓 دریافت اکانت تست

${divider}

برای آشنایی با کیفیت سرویس می‌توانید یک اکانت تست رایگان دریافت کنید.

✨ ویژگی‌ها:

• دسترسی کامل به سرویس
• تحویل فوری
• نمایش در بخش «اکانت‌های من»
• فعال تا پایان مدت اعتبار

${divider}

📌 وضعیت شما:
آماده دریافت

برای دریافت اکانت تست روی دکمه زیر کلیک کنید.`,
      keyboard: [[{ text: "🆓 دریافت اکانت تست", action: "freeAccount:claim" }], [{ text: "🔙 بازگشت", action: "nav:back" }]],
    };
  });

  registerView("admin.dashboard", async () => {
    const stats = await AdminService.dashboard(true);
    return { text: `⚙️ مرکز مدیریت\n\n${divider}\n📊 نمای کلی عملیات\n\n👥 کاربران: ${stats.users.toLocaleString("fa-IR")}\n💰 درآمد موفق: ${money(stats.revenue)}\n🧾 سفارش‌ها: ${stats.orders.toLocaleString("fa-IR")}\n🎧 تیکت‌های فعال: ${stats.openTickets.toLocaleString("fa-IR")}\n💳 واریزی‌های منتظر: ${stats.submittedDeposits.toLocaleString("fa-IR")}\n📦 موجودی آماده فروش: ${stats.availableAccounts.toLocaleString("fa-IR")}\n${divider}\n\nماژول مدیریتی را انتخاب کنید:`, keyboard: [[{ text: "💰 مالی", action: callbackFor("admin.deposits") }, { text: "🛒 فروشگاه", action: callbackFor("admin.products") }], [{ text: "👥 کاربران", action: callbackFor("admin.users") }, { text: "🎁 رفرال", action: callbackFor("admin.referrals") }], [{ text: "🆓 رایگان", action: callbackFor("admin.freeAccounts") }, { text: "📊 آمار", action: callbackFor("admin.analytics") }], [{ text: "🎧 تیکت‌ها", action: callbackFor("admin.tickets") }, { text: "🎟 کوپن‌ها", action: callbackFor("admin.coupons") }], [{ text: "🔐 اکانت‌ها", action: callbackFor("admin.accounts") }, { text: "⚙️ تنظیمات", action: callbackFor("admin.crypto") }, { text: "📢 عضویت", action: callbackFor("admin.forcedJoin") }]] };
  });

  registerView("admin.users", async (_ctx, params) => {
    const current = page(params);
    const [users, total] = await AdminService.listUsers(current);
    const keyboard = users.map((user) => [{ text: `👤 ${userLine(user)} · ${money(user.balance)}`, action: callbackFor("admin.user", { userId: user.id }) }]);
    keyboard.push([{ text: "قبلی", action: callbackFor("admin.users", { page: Math.max(current - 1, 1) }) }, { text: "بعدی", action: callbackFor("admin.users", { page: current + 1 }) }]);
    return { text: `👥 کاربران\n\nصفحه ${current.toLocaleString("fa-IR")} از ${pages(total, 8)}`, keyboard };
  });

  registerView("admin.user", async (_ctx, params) => {
    const profile = await AdminService.userProfile(params.userId);
    if (!profile.user) return { text: "⚠️ کاربر پیدا نشد.", keyboard: [] };
    return { text: `👤 پروفایل کاربر\n\n${userLine(profile.user)}\nموجودی: ${money(profile.user.balance)}\nدعوت موفق: ${profile.referralCount.toLocaleString("fa-IR")}\nوضعیت: ${profile.user.isBanned ? "مسدود" : "فعال"}\n\nخریدهای اخیر:\n${profile.orders.map((order) => `• ${order.product.title} · ${money(order.totalAmount)}`).join("\n") || "خریدی ندارد"}\n\nتراکنش‌های کیف پول:\n${profile.transactions.map((tx) => `• ${tx.description}: ${money(tx.amount)}`).join("\n") || "تراکنشی ندارد"}`, keyboard: [[{ text: "➕ افزودن موجودی", action: `flow:start:wallet_adjust:${profile.user.id}:credit` }, { text: "➖ کسر موجودی", action: `flow:start:wallet_adjust:${profile.user.id}:debit` }], [{ text: profile.user.isBanned ? "✅ رفع مسدودی" : "⛔ مسدودسازی", action: `admin:user:ban:${profile.user.id}:${profile.user.isBanned ? "0" : "1"}` }], [{ text: "📜 سوابق مسدودی", action: callbackFor("admin.user.blocks", { userId: profile.user.id }) }]] };
  });

  registerView("admin.user.blocks", async (_ctx, params) => {
    const history = await AdminService.userBlockHistory(params.userId);
    return { text: `📜 سوابق مسدودی\n\n${history.map((item) => `• ${item.blocked ? "مسدود" : "رفع مسدودی"} · مدیر: ${item.actorId} · ${item.createdAt.toLocaleString("fa-IR")}${item.reason ? ` · ${item.reason}` : ""}`).join("\n") || "سابقه‌ای ثبت نشده است."}`, keyboard: [] };
  });

  registerView("admin.products", async (_ctx, params) => {
    const current = page(params);
    const [products, total] = await AdminService.listProducts(current);
    const keyboard = products.map((product) => [{ text: `📦 ${product.title} · ${money(product.price)}`, action: callbackFor("admin.product", { productId: product.id }) }]);
    keyboard.push([{ text: "➕ محصول جدید", action: "flow:start:product_create" }]);
    keyboard.push([{ text: "قبلی", action: callbackFor("admin.products", { page: Math.max(current - 1, 1) }) }, { text: "بعدی", action: callbackFor("admin.products", { page: current + 1 }) }]);
    return { text: `🛒 مدیریت فروشگاه\n\nصفحه ${current.toLocaleString("fa-IR")} از ${pages(total, 8)}`, keyboard };
  });

  registerView("admin.product", async (_ctx, params) => {
    const detail = await AdminService.productDetail(params.productId);
    if (!detail.product) return { text: "⚠️ محصول پیدا نشد.", keyboard: [] };
    return { text: `📦 ${detail.product.title}\n\nدسته‌بندی: ${detail.product.category.name}\nقیمت: ${money(detail.product.price)}\nمدت: ${detail.product.duration.toLocaleString("fa-IR")} روز\nموجودی قابل فروش: ${detail.available.toLocaleString("fa-IR")}\nفروخته‌شده: ${detail.sold.toLocaleString("fa-IR")}\nوضعیت: ${detail.product.isActive ? "فعال" : "غیرفعال"}`, keyboard: [[{ text: "🔐 افزودن اکانت", action: `flow:start:account_create:${detail.product.id}` }, { text: "💰 تغییر قیمت", action: `flow:start:product_price:${detail.product.id}` }], [{ text: detail.product.isActive ? "غیرفعال‌سازی" : "فعال‌سازی", action: `admin:product:active:${detail.product.id}:${detail.product.isActive ? "0" : "1"}` }, { text: "حذف نرم", action: `admin:product:delete:${detail.product.id}` }], [{ text: "حذف دائمی", action: `admin:product:hard_delete:confirm:${detail.product.id}` }]] };
  });

  registerView("admin.accounts", async () => {
    const stats = await AdminService.accountStats();
    return { text: `🔐 مدیریت اکانت‌ها\n\nاکانت آماده فروش: ${stats.available.toLocaleString("fa-IR")}\nاکانت فروخته‌شده: ${stats.sold.toLocaleString("fa-IR")}\n\nبرای افزودن اکانت، محصول را انتخاب کنید.`, keyboard: stats.products.map((product) => [{ text: `➕ ${product.title}`, action: `flow:start:account_create:${product.id}` }]) };
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
        ...inventory.map((item) => [{ text: `👁 ${item.username} · ${FREE_ACCOUNT_STATUS_LABELS[item.status]}`, action: `admin:free_account:view:${item.id}` }]),
        [{ text: "قبلی", action: callbackFor("admin.freeAccounts", { page: Math.max(current - 1, 1) }) }, { text: "بعدی", action: callbackFor("admin.freeAccounts", { page: current + 1 }) }],
      ],
    };
  });

  registerView("admin.crypto", async () => {
    const stats = await AdminService.cryptoWalletStats();
    return { text: `⚙️ تنظیمات مالی و پرداخت\n\nحداقل شارژ کیف پول: ${money(stats.setting.minimumTopupAmount)}\n\n${stats.wallets.map((wallet) => `• ${wallet.coinName} · شبکه ${wallet.networkName}\n  وضعیت: ${wallet.status === "active" ? "فعال" : "غیرفعال"}\n  نرخ: ${wallet.rateToman > 0 ? money(wallet.rateToman) : "در انتظار دریافت"}\n  آخرین بروزرسانی: ${wallet.lastRateAt ? wallet.lastRateAt.toLocaleString("fa-IR") : "—"}\n  آدرس: ${wallet.walletAddress}`).join("\n\n") || "هنوز کیف پولی ثبت نشده است."}`, keyboard: [[{ text: "➕ کیف پول", action: "flow:start:crypto_wallet_create" }], [{ text: "⚙️ حداقل شارژ", action: "flow:start:minimum_topup" }, { text: "وضعیت فروشگاه", action: callbackFor("admin.store") }]] };
  });

  registerView("admin.store", async () => {
    const stats = await AdminService.cryptoWalletStats();
    return { text: `⚙️ وضعیت فروشگاه\n\nوضعیت فعلی: ${stats.setting.storeStatus === "active" ? "فعال" : "غیرفعال"}\n\nدر حالت غیرفعال، کاربران عادی به خرید دسترسی ندارند اما مدیران همچنان می‌توانند عملیات را مدیریت کنند.`, keyboard: [[{ text: "✅ فعال", action: "admin:store:status:active" }, { text: "⛔ غیرفعال", action: "admin:store:status:inactive" }]] };
  });


  registerView("admin.forcedJoin", async () => {
    const channels = await AdminService.forcedJoinChannels();
    return {
      text: `📢 مدیریت عضویت اجباری\n\n${channels.map((channel) => `• ${channel.title} · ${channel.chatId} · ${channel.status === "active" ? "فعال" : "غیرفعال"}`).join("\n") || "کانالی ثبت نشده است."}`,
      keyboard: [[{ text: "➕ افزودن کانال", action: "flow:start:forced_join_create" }], ...channels.map((channel) => [{ text: channel.status === "active" ? `غیرفعال‌سازی ${channel.title}` : `فعال‌سازی ${channel.title}`, action: `admin:forced_join:status:${channel.id}:${channel.status === "active" ? "inactive" : "active"}` }, { text: "حذف", action: `admin:forced_join:delete:${channel.id}` }])],
    };
  });

  registerView("admin.referrals", async () => {
    const tiers = await ReferralService.listTiers();
    return { text: `🎁 مدیریت رفرال\n\n${tiers.map((tier) => `• ${tier.threshold.toLocaleString("fa-IR")} دعوت ← ${money(tier.amount)} · ${tier.isActive ? "فعال" : "غیرفعال"}`).join("\n") || "سطحی ثبت نشده است."}`, keyboard: [[{ text: "➕ سطح جدید/ویرایش", action: "flow:start:referral_tier_create" }], ...tiers.map((tier) => [{ text: tier.isActive ? `غیرفعال‌سازی ${tier.threshold}` : `فعال‌سازی ${tier.threshold}`, action: `admin:referral:tier:status:${tier.id}:${tier.isActive ? "0" : "1"}` }, { text: `حذف ${tier.threshold}`, action: `admin:referral:tier:delete:${tier.id}` }])] };
  });

  registerView("admin.analytics", async () => {
    const stats = await AdminService.dashboard(true);
    return { text: `📊 آمار عملیاتی\n\n💰 درآمد موفق: ${money(stats.revenue)}\n📦 اکانت آماده فروش: ${stats.availableAccounts.toLocaleString("fa-IR")}\n✅ اکانت فروخته‌شده: ${stats.soldAccounts.toLocaleString("fa-IR")}\n🎁 مجموع پاداش دعوت: ${money(stats.referralRewards)}\n🆓 اکانت تست تخصیص‌یافته: ${stats.freeAccountsAssigned.toLocaleString("fa-IR")}\n💳 واریزی در انتظار: ${stats.submittedDeposits.toLocaleString("fa-IR")}`, keyboard: [] };
  });

  registerView("admin.coupons", async (_ctx, params) => {
    const current = page(params);
    const [coupons, total] = await AdminService.listCoupons(current);
    return {
      text: `🎟 مدیریت کوپن‌ها\n\n${coupons.map((coupon) => `• ${coupon.code} · ${coupon.type === "percentage" ? `${(coupon.value || coupon.discountPercent || 0).toLocaleString("fa-IR")}%` : money(coupon.value)} · ${coupon.status} · ${coupon.usedCount.toLocaleString("fa-IR")}/${coupon.maxUses.toLocaleString("fa-IR")} · هر کاربر ${coupon.perUserLimit.toLocaleString("fa-IR")}`).join("\n") || "کوپنی ثبت نشده است."}\n\nصفحه ${current.toLocaleString("fa-IR")} از ${pages(total, 8)}`,
      keyboard: [[{ text: "➕ کوپن جدید", action: "flow:start:coupon_create" }], ...coupons.map((coupon) => [{ text: `مدیریت ${coupon.code}`, action: callbackFor("admin.coupon", { couponId: coupon.id }) }]), [{ text: "قبلی", action: callbackFor("admin.coupons", { page: Math.max(current - 1, 1) }) }, { text: "بعدی", action: callbackFor("admin.coupons", { page: current + 1 }) }]],
    };
  });


  registerView("admin.coupon", async (_ctx, params) => {
    const direct = await AdminService.couponDetail(params.couponId);
    if (!direct) return { text: "⚠️ کوپن پیدا نشد.", keyboard: [] };
    return {
      text: `🎟 جزئیات کوپن ${direct.code}\n\nنوع: ${direct.type === "percentage" ? "درصدی" : "مبلغ ثابت"}\nمقدار: ${direct.type === "percentage" ? `${(direct.value || direct.discountPercent || 0).toLocaleString("fa-IR")}%` : money(direct.value)}\nوضعیت: ${direct.status}\nمصرف: ${direct.usedCount.toLocaleString("fa-IR")}/${direct.maxUses.toLocaleString("fa-IR")}\nسقف هر کاربر: ${direct.perUserLimit.toLocaleString("fa-IR")}\nحداقل خرید: ${money(direct.minimumPurchaseAmount)}\nانقضا: ${direct.expiresAt.toLocaleDateString("fa-IR")}`,
      keyboard: [[{ text: direct.status === "active" ? "⛔ غیرفعال" : "✅ فعال", action: `admin:coupon:status:${direct.id}:${direct.status === "active" ? "inactive" : "active"}` }], [{ text: "🗑 حذف نرم", action: `admin:coupon:soft_delete:${direct.id}` }, { text: "🧨 حذف دائمی", action: `admin:coupon:hard_delete:${direct.id}` }]],
    };
  });

  registerView("admin.deposits", async (_ctx, params) => {
    const current = page(params);
    const [deposits, total] = await AdminService.listSubmittedDeposits(current);
    return { text: `💰 مدیریت واریزی‌ها\n\nصفحه ${current.toLocaleString("fa-IR")} از ${pages(total, 8)}`, keyboard: deposits.map((deposit) => [{ text: `💳 ${deposit.user.telegramId} · ${money(deposit.amount)}`, action: callbackFor("admin.deposit", { depositId: deposit.id }) }]) };
  });

  registerView("admin.deposit", async (_ctx, params) => {
    const deposit = await AdminService.depositDetail(params.depositId);
    if (!deposit) return { text: "⚠️ واریزی پیدا نشد.", keyboard: [] };
    return { text: `💳 جزئیات واریزی\n\nکاربر: ${deposit.user.telegramId}\nمبلغ: ${money(deposit.amount)}\nارز: ${deposit.cryptoType.toUpperCase()}\nوضعیت: ${deposit.status}\nرسید: ${deposit.receipt ? "ثبت شده" : "ثبت نشده"}`, keyboard: [[{ text: "✅ تأیید", action: `admin:deposit:approve:${deposit.id}` }, { text: "❌ رد", action: `admin:deposit:reject:${deposit.id}` }]] };
  });

  registerView("admin.orders", async (_ctx, params) => {
    const current = page(params);
    const [orders, total] = await AdminService.listRecentOrders(current);
    return { text: `🧾 سفارش‌ها\n\n${orders.map((order) => `• #${shortId(order.id)} · ${order.user.telegramId} · ${order.product.title} · ${money(order.totalAmount)}`).join("\n") || "سفارشی ثبت نشده است."}\n\nصفحه ${current.toLocaleString("fa-IR")} از ${pages(total, 8)}`, keyboard: [[{ text: "قبلی", action: callbackFor("admin.orders", { page: Math.max(current - 1, 1) }) }, { text: "بعدی", action: callbackFor("admin.orders", { page: current + 1 }) }]] };
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
        ...tickets.map((ticket) => [{ text: `${ticket.status === "open" ? "🟢" : "⚫️"} ${ticket.user.telegramId} · #${shortId(ticket.id)}`, action: callbackFor("admin.ticket", { ticketId: ticket.id }) }]),
        [{ text: "قبلی", action: callbackFor("admin.tickets", { page: Math.max(current - 1, 1) }) }, { text: "بعدی", action: callbackFor("admin.tickets", { page: current + 1 }) }],
      ],
    };
  });

  registerView("admin.ticket", async (_ctx, params) => {
    const ticket = await SupportService.getTicketWithUser(params.ticketId);
    if (!ticket) return { text: "⚠️ تیکت پیدا نشد.", keyboard: [] };
    const statusAction = ticket.status === "open" ? { text: "✅ بستن", action: `admin:ticket:close:${ticket.id}` } : { text: "🔄 باز کردن مجدد", action: `admin:ticket:reopen:${ticket.id}` };
    return {
      text: `🎫 تیکت #${shortId(ticket.id)}
${divider}

👤 کاربر: ${ticket.user.telegramId}${ticket.user.username ? ` (@${ticket.user.username})` : ""}
⚡ وضعیت: ${ticket.status === "open" ? "باز ✅" : "بسته 🔒"}
🕒 آخرین بروزرسانی: ${ticket.updatedAt.toLocaleString("fa-IR")}

${ticket.messages.map((message) => `${message.senderRole === "admin" ? "👨‍💼 پشتیبانی" : "👤 کاربر"} · ${message.createdAt.toLocaleString("fa-IR")}
${message.message}`).join("\n\n") || "بدون پیام"}`,
      keyboard: [[{ text: "💬 ورود به چت", action: `support:admin:chat:${ticket.id}` }, { text: "↩️ پاسخ سریع", action: `flow:start:ticket_reply:${ticket.id}` }], [statusAction]],
    };
  });

}
