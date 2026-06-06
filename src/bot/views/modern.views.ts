import { registerView, callbackFor, type UiKeyboard } from "../navigation/panel-ui";
import type { AppContext } from "../../types/bot";
import { isAdminByTelegramId } from "../middlewares/admin.middleware";
import { UserService } from "../../modules/user/user.service";
import { ProductService } from "../../modules/product/product.service";
import { AdminService } from "../../modules/admin/admin.service";
import { ReferralService } from "../../modules/referral/referral.service";
import { FreeConfigService } from "../../modules/rewards/free-config.service";
import { FreeAccountService } from "../../modules/free-account/free-account.service";
import { SupportService } from "../../modules/support/support.service";

const money = (value: number) => `${value.toLocaleString("fa-IR")} تومان`;
const page = (params: Record<string, string>) => Math.max(Number(params.page ?? 1), 1);
const pages = (total: number, take: number) => Math.max(Math.ceil(total / take), 1).toLocaleString("fa-IR");
const userLine = (user: { telegramId: string; username?: string | null; firstName?: string | null }) => `${user.firstName ?? "کاربر"} ${user.username ? `@${user.username}` : user.telegramId}`;

export function registerModernViews() {
  registerView("home", async (ctx) => {
    const user = ctx.from ? await UserService.findOrCreateUser(ctx) : undefined;
    const isAdmin = ctx.from ? await isAdminByTelegramId(ctx.from.id) : false;
    const keyboard: UiKeyboard = [
      [{ text: "🛍 فروشگاه", action: callbackFor("shop.categories") }, { text: "💳 کیف پول", action: callbackFor("wallet") }],
      [{ text: "➕ شارژ حساب", action: callbackFor("deposit") }, { text: "🎧 پشتیبانی", action: callbackFor("support") }],
      [{ text: "🎁 دعوت دوستان", action: callbackFor("referral") }, { text: "🆓 اکانت رایگان", action: callbackFor("freeAccount") }],
    ];
    if (isAdmin) keyboard.push([{ text: "⚙️ پنل مدیریت", action: callbackFor("admin.dashboard") }]);
    return { text: `سلام ${ctx.from?.first_name ?? "دوست عزیز"} 🌿\n\nبه پنل هوشمند نیمه شب خوش آمدید.\n\nموجودی شما: ${money(user?.balance ?? 0)}\n\nاز منوی زیر انتخاب کنید:`, keyboard };
  });

  registerView("shop.categories", async () => {
    const categories = await ProductService.getCategories();
    return { text: "🛍 فروشگاه\n\nدسته‌بندی مورد نظر را انتخاب کنید:", keyboard: categories.map((category) => [{ text: `📁 ${category.name} (${category.products.length.toLocaleString("fa-IR")})`, action: callbackFor("shop.products", { categoryId: category.id }) }]) };
  });

  registerView("shop.products", async (_ctx, params) => {
    const products = await ProductService.getProductsByCategory(params.categoryId);
    return { text: "📦 محصولات\n\nیک محصول را برای مشاهده جزئیات انتخاب کنید:", keyboard: products.map((product) => [{ text: `${product.title} — ${money(product.price)}`, action: callbackFor("shop.product", { productId: product.id }) }]) };
  });

  registerView("shop.product", async (_ctx, params) => {
    const product = await ProductService.getProduct(params.productId);
    if (!product) return { text: "محصول پیدا نشد.", keyboard: [] };
    const stock = await ProductService.availableStock(product.id);
    return { text: `📦 ${product.title}\n\nدسته‌بندی: ${product.category.name}\nمدت سرویس: ${product.duration.toLocaleString("fa-IR")} روز\nقیمت: ${money(product.price)}\nموجودی: ${stock.toLocaleString("fa-IR")} عدد`, keyboard: [[{ text: "🛒 خرید", action: callbackFor("shop.checkout", { productId: product.id }) }], [{ text: "🎟 ثبت کد تخفیف", action: `flow:start:coupon_code:${product.id}` }]] };
  });

  registerView("shop.checkout", async (ctx, params) => {
    const user = ctx.from ? await UserService.getByTelegramId(ctx.from.id) : undefined;
    const product = await ProductService.getProduct(params.productId);
    if (!product || !user) return { text: "اطلاعات خرید کامل نیست.", keyboard: [] };
    const coupon = ctx.session.selectedCoupons?.[product.id];
    return { text: `🧾 پیش‌فاکتور\n\nمحصول: ${product.title}\nقیمت: ${money(product.price)}\nکد تخفیف: ${coupon ?? "ثبت نشده"}\nموجودی کیف پول: ${money(user.balance)}\n\nبرای تکمیل خرید تایید کنید.`, keyboard: [[{ text: "✅ تایید خرید", action: `buy:confirm:${product.id}` }], [{ text: "🎟 ثبت کد تخفیف", action: `flow:start:coupon_code:${product.id}` }]] };
  });

  registerView("wallet", async (ctx) => {
    const user = ctx.from ? await UserService.getByTelegramId(ctx.from.id) : undefined;
    return { text: `💳 کیف پول\n\nموجودی فعلی: ${money(user?.balance ?? 0)}\n\nبرای افزایش موجودی، شارژ حساب را انتخاب کنید.`, keyboard: [[{ text: "➕ شارژ حساب", action: callbackFor("deposit") }]] };
  });

  registerView("deposit", async () => ({ text: "➕ شارژ حساب\n\nمبلغ شارژ را در یک مرحله امن وارد کنید. بعد از ایجاد درخواست، رسید را ارسال می‌کنید.", keyboard: [[{ text: "شروع شارژ", action: "flow:start:deposit_submit" }]] }));

  registerView("support", async (ctx) => {
    const user = ctx.from ? await UserService.getByTelegramId(ctx.from.id) : undefined;
    const tickets = user ? await SupportService.getTicketWithUser("").catch(() => undefined) : undefined;
    void tickets;
    return { text: "🎧 پشتیبانی\n\nبرای ارتباط با تیم پشتیبانی، یک تیکت جدید بسازید یا پاسخ خود را در جریان تیکت ارسال کنید.", keyboard: [[{ text: "✉️ ایجاد تیکت", action: "flow:start:ticket_reply" }]] };
  });

  registerView("referral", async (ctx) => {
    const user = ctx.from ? await UserService.getByTelegramId(ctx.from.id) : undefined;
    if (!user) return { text: "کاربر پیدا نشد.", keyboard: [] };
    const stats = await ReferralService.getStats(user.id);
    const botUsername = process.env.BOT_USERNAME ?? "BOT";
    return { text: `🎁 دعوت دوستان\n\nکد دعوت شما: ${user.referralCode ?? "در حال ساخت"}\nلینک دعوت:\nhttps://t.me/${botUsername}?start=${user.referralCode}\n\nدعوت‌های موفق: ${stats.totalReferrals.toLocaleString("fa-IR")}\nپاداش آماده برداشت: ${money(stats.pendingAmount)}`, keyboard: [[{ text: "💰 برداشت پاداش", action: "referral:claim" }], [{ text: "🆓 وضعیت اکانت رایگان", action: callbackFor("freeAccount") }]] };
  });

  registerView("freeAccount", async (ctx) => {
    const user = ctx.from ? await UserService.getByTelegramId(ctx.from.id) : undefined;
    if (!user) return { text: "کاربر پیدا نشد.", keyboard: [] };
    const status = await FreeConfigService.getStatus(user.id);
    const assigned = await FreeAccountService.assignedForUser(user.id);
    return { text: `🆓 اکانت رایگان\n\nدعوت‌های شما: ${status.referralCount.toLocaleString("fa-IR")} از ${status.requiredReferrals.toLocaleString("fa-IR")}\nاکانت‌های اختصاص‌یافته: ${assigned.length.toLocaleString("fa-IR")}\n\n${assigned.map((item) => `• ${item.product.title}\nنام کاربری: ${item.username}\nرمز: ${item.password}\nکانفیگ: ${item.config}`).join("\n\n") || "هنوز اکانت رایگان اختصاص داده نشده است."}`, keyboard: [[{ text: "🎁 مشاهده دعوت دوستان", action: callbackFor("referral") }]] };
  });

  registerView("admin.dashboard", async () => {
    const stats = await AdminService.dashboard(true);
    return { text: `⚙️ داشبورد مدیریت\n\n👥 کاربران: ${stats.users.toLocaleString("fa-IR")}\n💰 درآمد: ${money(stats.revenue)}\n🧾 سفارش‌ها: ${stats.orders.toLocaleString("fa-IR")}\n🎧 تیکت‌های فعال: ${stats.openTickets.toLocaleString("fa-IR")}\n💳 واریزی‌های منتظر: ${stats.submittedDeposits.toLocaleString("fa-IR")}`, keyboard: [[{ text: "👥 کاربران", action: callbackFor("admin.users") }, { text: "📦 محصولات", action: callbackFor("admin.products") }], [{ text: "🔐 اکانت‌ها", action: callbackFor("admin.accounts") }, { text: "🎁 اکانت رایگان", action: callbackFor("admin.freeAccounts") }], [{ text: "🎟 کوپن‌ها", action: callbackFor("admin.coupons") }, { text: "💳 واریزی‌ها", action: callbackFor("admin.deposits") }], [{ text: "🧾 سفارش‌ها", action: callbackFor("admin.orders") }, { text: "🎧 تیکت‌ها", action: callbackFor("admin.tickets") }]] };
  });

  registerView("admin.users", async (_ctx, params) => {
    const current = page(params);
    const [users, total] = await AdminService.listUsers(current);
    const keyboard = users.map((user) => [{ text: `👤 ${userLine(user)} — ${money(user.balance)}`, action: callbackFor("admin.user", { userId: user.id }) }]);
    keyboard.push([{ text: "قبلی", action: callbackFor("admin.users", { page: Math.max(current - 1, 1) }) }, { text: "بعدی", action: callbackFor("admin.users", { page: current + 1 }) }]);
    return { text: `👥 مدیریت کاربران\n\nصفحه ${current.toLocaleString("fa-IR")} از ${pages(total, 8)}`, keyboard };
  });

  registerView("admin.user", async (_ctx, params) => {
    const profile = await AdminService.userProfile(params.userId);
    if (!profile.user) return { text: "کاربر پیدا نشد.", keyboard: [] };
    return { text: `👤 پروفایل کاربر\n\n${userLine(profile.user)}\nموجودی: ${money(profile.user.balance)}\nدعوت موفق: ${profile.referralCount.toLocaleString("fa-IR")}\nوضعیت: ${profile.user.isBanned ? "مسدود" : "فعال"}\n\nخریدهای اخیر:\n${profile.orders.map((order) => `• ${order.product.title} — ${money(order.totalAmount)}`).join("\n") || "خریدی ندارد"}\n\nتراکنش‌های کیف پول:\n${profile.transactions.map((tx) => `• ${tx.description}: ${money(tx.amount)}`).join("\n") || "تراکنشی ندارد"}`, keyboard: [[{ text: "➕ افزودن موجودی", action: `flow:start:wallet_adjust:${profile.user.id}:credit` }, { text: "➖ کسر موجودی", action: `flow:start:wallet_adjust:${profile.user.id}:debit` }], [{ text: profile.user.isBanned ? "✅ رفع مسدودی" : "⛔ مسدودسازی", action: `admin:user:ban:${profile.user.id}:${profile.user.isBanned ? "0" : "1"}` }]] };
  });

  registerView("admin.products", async (_ctx, params) => {
    const current = page(params);
    const [products, total] = await AdminService.listProducts(current);
    const keyboard = products.map((product) => [{ text: `📦 ${product.title} — ${money(product.price)}`, action: callbackFor("admin.product", { productId: product.id }) }]);
    keyboard.push([{ text: "➕ محصول جدید", action: "flow:start:product_create" }]);
    keyboard.push([{ text: "قبلی", action: callbackFor("admin.products", { page: Math.max(current - 1, 1) }) }, { text: "بعدی", action: callbackFor("admin.products", { page: current + 1 }) }]);
    return { text: `📦 مدیریت محصولات\n\nصفحه ${current.toLocaleString("fa-IR")} از ${pages(total, 8)}`, keyboard };
  });

  registerView("admin.product", async (_ctx, params) => {
    const detail = await AdminService.productDetail(params.productId);
    if (!detail.product) return { text: "محصول پیدا نشد.", keyboard: [] };
    return { text: `📦 ${detail.product.title}\n\nدسته‌بندی: ${detail.product.category.name}\nقیمت: ${money(detail.product.price)}\nمدت: ${detail.product.duration.toLocaleString("fa-IR")} روز\nموجودی قابل فروش: ${detail.available.toLocaleString("fa-IR")}\nفروخته‌شده: ${detail.sold.toLocaleString("fa-IR")}\nوضعیت: ${detail.product.isActive ? "فعال" : "غیرفعال"}`, keyboard: [[{ text: "🔐 افزودن اکانت", action: `flow:start:account_create:${detail.product.id}` }, { text: "💰 تغییر قیمت", action: `flow:start:product_price:${detail.product.id}` }], [{ text: detail.product.isActive ? "غیرفعال‌سازی" : "فعال‌سازی", action: `admin:product:active:${detail.product.id}:${detail.product.isActive ? "0" : "1"}` }, { text: "حذف نرم", action: `admin:product:delete:${detail.product.id}` }]] };
  });

  registerView("admin.accounts", async () => {
    const stats = await AdminService.accountStats();
    return { text: `🔐 مدیریت اکانت‌ها\n\nاکانت‌های آماده فروش: ${stats.available.toLocaleString("fa-IR")}\nاکانت‌های فروخته‌شده: ${stats.sold.toLocaleString("fa-IR")}\n\nبرای افزودن اکانت، محصول را انتخاب کنید.`, keyboard: stats.products.map((product) => [{ text: `➕ ${product.title}`, action: `flow:start:account_create:${product.id}` }]) };
  });

  registerView("admin.freeAccounts", async () => {
    const stats = await FreeAccountService.stats();
    return { text: `🎁 استخر اکانت رایگان\n\nآماده تخصیص: ${stats.available.toLocaleString("fa-IR")}\nتخصیص‌یافته: ${stats.assigned.toLocaleString("fa-IR")}\nآستانه دعوت: ${FreeAccountService.threshold().toLocaleString("fa-IR")} نفر\n\nبرای افزودن اکانت رایگان، محصول را انتخاب کنید.`, keyboard: stats.products.map((product) => [{ text: `➕ ${product.title}`, action: `flow:start:free_account_create:${product.id}` }]) };
  });

  registerView("admin.coupons", async (_ctx, params) => {
    const current = page(params);
    const [coupons, total] = await AdminService.listCoupons(current);
    return { text: `🎟 مدیریت کوپن‌ها\n\n${coupons.map((coupon) => `• ${coupon.code} — ${coupon.discountPercent.toLocaleString("fa-IR")}% — ${coupon.usedCount.toLocaleString("fa-IR")}/${coupon.maxUses.toLocaleString("fa-IR")}`).join("\n") || "کوپنی ثبت نشده است."}\n\nصفحه ${current.toLocaleString("fa-IR")} از ${pages(total, 8)}`, keyboard: [[{ text: "➕ کوپن جدید", action: "flow:start:coupon_create" }], [{ text: "قبلی", action: callbackFor("admin.coupons", { page: Math.max(current - 1, 1) }) }, { text: "بعدی", action: callbackFor("admin.coupons", { page: current + 1 }) }]] };
  });

  registerView("admin.deposits", async (_ctx, params) => {
    const current = page(params);
    const [deposits, total] = await AdminService.listSubmittedDeposits(current);
    return { text: `💳 مدیریت واریزی‌ها\n\nصفحه ${current.toLocaleString("fa-IR")} از ${pages(total, 8)}`, keyboard: deposits.map((deposit) => [{ text: `💳 ${deposit.user.telegramId} — ${money(deposit.amount)}`, action: callbackFor("admin.deposit", { depositId: deposit.id }) }]) };
  });

  registerView("admin.deposit", async (_ctx, params) => {
    const deposit = await AdminService.depositDetail(params.depositId);
    if (!deposit) return { text: "واریزی پیدا نشد.", keyboard: [] };
    return { text: `💳 جزئیات واریزی\n\nکاربر: ${deposit.user.telegramId}\nمبلغ: ${money(deposit.amount)}\nارز: ${deposit.cryptoType.toUpperCase()}\nوضعیت: ${deposit.status}\nرسید: ${deposit.receipt ? "ثبت شده" : "ثبت نشده"}`, keyboard: [[{ text: "✅ تایید", action: `admin:deposit:approve:${deposit.id}` }, { text: "❌ رد", action: `admin:deposit:reject:${deposit.id}` }]] };
  });

  registerView("admin.orders", async (_ctx, params) => {
    const current = page(params);
    const [orders, total] = await AdminService.listRecentOrders(current);
    return { text: `🧾 مدیریت سفارش‌ها\n\n${orders.map((order) => `• ${order.id.slice(-6)} — ${order.user.telegramId} — ${order.product.title} — ${money(order.totalAmount)}`).join("\n") || "سفارشی ثبت نشده است."}\n\nصفحه ${current.toLocaleString("fa-IR")} از ${pages(total, 8)}`, keyboard: [[{ text: "قبلی", action: callbackFor("admin.orders", { page: Math.max(current - 1, 1) }) }, { text: "بعدی", action: callbackFor("admin.orders", { page: current + 1 }) }]] };
  });

  registerView("admin.tickets", async (_ctx, params) => {
    const current = page(params);
    const [tickets, total] = await AdminService.listOpenTickets(current);
    return { text: `🎧 تیکت‌های فعال\n\nصفحه ${current.toLocaleString("fa-IR")} از ${pages(total, 8)}`, keyboard: tickets.map((ticket) => [{ text: `🎧 ${ticket.user.telegramId} — ${ticket.id.slice(-6)}`, action: callbackFor("admin.ticket", { ticketId: ticket.id }) }]) };
  });

  registerView("admin.ticket", async (_ctx, params) => {
    const ticket = await SupportService.getTicketWithUser(params.ticketId);
    if (!ticket) return { text: "تیکت پیدا نشد.", keyboard: [] };
    return { text: `🎧 تیکت ${ticket.id.slice(-6)}\nکاربر: ${ticket.user.telegramId}\n\n${ticket.messages.map((message) => `${message.senderRole === "admin" ? "ادمین" : "کاربر"}: ${message.message}`).join("\n") || "بدون پیام"}`, keyboard: [[{ text: "↩️ پاسخ", action: `flow:start:ticket_reply:${ticket.id}` }, { text: "✅ بستن", action: `admin:ticket:close:${ticket.id}` }]] };
  });
}
