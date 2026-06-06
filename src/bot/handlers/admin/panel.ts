import { Markup } from "telegraf";
import type { AppBot, AppContext } from "../../../types/bot";
import { DepositService } from "../../../modules/deposit/deposit.service";
import { ProductService } from "../../../modules/product/product.service";
import { SupportService } from "../../../modules/support/support.service";
import { AdminService } from "../../../modules/admin/admin.service";
import { adminKeyboard } from "../../keyboards/admin.keyboard";
import { navigationKeyboard } from "../../keyboards/main.keyboard";
import { isAdminByTelegramId } from "../../middlewares/admin.middleware";
import { getPagination, getTotalPages } from "../../../utils/pagination";
import { setFlow } from "./admin.flow";

async function requireAdmin(ctx: AppContext) {
  if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) {
    await ctx.answerCbQuery?.("دسترسی غیرمجاز").catch(() => undefined);
    return false;
  }
  return true;
}

function paginationKeyboard(prefix: string, page: number, totalPages: number, backTo = "admin:dashboard") {
  const rows = [];
  const nav = [];
  if (page > 1) nav.push(Markup.button.callback("⬅️ قبلی", `${prefix}:page:${page - 1}`));
  if (page < totalPages) nav.push(Markup.button.callback("بعدی ➡️", `${prefix}:page:${page + 1}`));
  if (nav.length) rows.push(nav);
  rows.push([Markup.button.callback("🔎 جستجو", `${prefix}:search`), Markup.button.callback("↩️ بازگشت", backTo)]);
  return Markup.inlineKeyboard(rows);
}

export function registerAdminHandlers(bot: AppBot) {
  bot.action("admin:dashboard", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();
    const stats = await AdminService.dashboard();
    await ctx.reply(
      `👨‍💼 پنل مدیریت\n\n👥 کاربران: ${stats.users.toLocaleString("fa-IR")}\n📦 محصولات: ${stats.products.toLocaleString("fa-IR")}\n💳 واریزی‌های در انتظار: ${stats.submittedDeposits.toLocaleString("fa-IR")}\n🎧 تیکت‌های باز: ${stats.openTickets.toLocaleString("fa-IR")}\n🧾 سفارش‌ها: ${stats.orders.toLocaleString("fa-IR")}\n💰 درآمد: ${stats.revenue.toLocaleString("fa-IR")} تومان`,
      adminKeyboard(),
    );
  });

  bot.action(["admin:users", /^admin:users:page:(\d+)$/], async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();
    const page = "match" in ctx && ctx.match ? Number(ctx.match[1]) : 1;
    const { skip, take, pageSize } = getPagination(page);
    const [users, total] = await AdminService.listUsers(skip, take);
    await ctx.reply(
      users.map((user) => `👤 ${user.telegramId} @${user.username ?? "-"} | ${user.balance.toLocaleString("fa-IR")} تومان`).join("\n") || "کاربری وجود ندارد.",
      paginationKeyboard("admin:users", page, getTotalPages(total, pageSize)),
    );
  });

  bot.action("admin:users:search", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();
    ctx.session.state = { name: "admin_user_search" };
    await ctx.reply("🔎 شناسه تلگرام، نام کاربری یا نام کاربر را ارسال کنید:", navigationKeyboard("admin:users"));
  });

  bot.action(["admin:products", /^admin:products:page:(\d+)$/], async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();
    const page = "match" in ctx && ctx.match ? Number(ctx.match[1]) : 1;
    const { skip, take, pageSize } = getPagination(page);
    const [products, total] = await AdminService.listProducts(skip, take);
    const lines = await Promise.all(products.map(async (product) => `📦 ${product.title} | ${product.category.name} | ${product.price.toLocaleString("fa-IR")} تومان | موجودی ${(await ProductService.availableStock(product.id)).toLocaleString("fa-IR")}`));
    await ctx.reply(lines.join("\n") || "محصولی وجود ندارد.", paginationKeyboard("admin:products", page, getTotalPages(total, pageSize)));
  });

  bot.action("admin:products:search", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();
    ctx.session.state = { name: "admin_product_search" };
    await ctx.reply("🔎 عنوان محصول یا نام دسته‌بندی را ارسال کنید:", navigationKeyboard("admin:products"));
  });

  bot.action("admin:product:create", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();
    setFlow(ctx, { flow: "product_create", step: "title", data: {} });
    await ctx.reply("📦 نام محصول را ارسال کنید:", navigationKeyboard("admin:dashboard"));
  });

  bot.action("admin:accounts", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();
    const products = await ProductService.listActiveProducts(25);
    await ctx.reply(
      "برای کدام محصول اکانت اضافه شود؟",
      Markup.inlineKeyboard([...products.map((product) => [Markup.button.callback(product.title, `admin:account:create:${product.id}`)]), [Markup.button.callback("⬅️ بازگشت", "admin:dashboard")]]),
    );
  });

  bot.action(/^admin:account:create:(.+)$/, async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();
    setFlow(ctx, { flow: "account_create", step: "username", data: { productId: ctx.match[1] } });
    await ctx.reply("👤 نام کاربری اکانت را ارسال کنید:", navigationKeyboard("admin:dashboard"));
  });

  bot.action("admin:deposits", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();
    const deposits = await AdminService.listSubmittedDeposits();
    if (deposits.length === 0) {
      await ctx.reply("واریزی در انتظار بررسی وجود ندارد.", navigationKeyboard("admin:dashboard"));
      return;
    }
    for (const deposit of deposits) {
      const buttons = Markup.inlineKeyboard([[Markup.button.callback("✅ تایید", `admin:deposit:approve:${deposit.id}`), Markup.button.callback("❌ رد", `admin:deposit:reject:${deposit.id}`)]]);
      const caption = `💳 واریزی\nکاربر: ${deposit.user.telegramId}\nمبلغ: ${deposit.amount.toLocaleString("fa-IR")} تومان\nارز: ${deposit.cryptoType}`;
      if (deposit.receipt) await ctx.replyWithPhoto(deposit.receipt, { caption, ...buttons });
      else await ctx.reply(caption, buttons);
    }
  });

  bot.action(/^admin:deposit:(approve|reject):(.+)$/, async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();
    const action = ctx.match[1];
    const depositId = ctx.match[2];
    try {
      await (action === "approve" ? DepositService.approve(depositId, String(ctx.from.id)) : DepositService.reject(depositId, String(ctx.from.id)));
      AdminService.invalidateDashboardCache();
      await ctx.reply(action === "approve" ? "✅ واریزی تایید و کیف پول شارژ شد." : "❌ واریزی رد شد.", navigationKeyboard("admin:deposits"));
    } catch (error) {
      await ctx.reply(`❌ ${error instanceof Error ? error.message : "عملیات ناموفق بود"}`, navigationKeyboard("admin:deposits"));
    }
  });

  bot.action("admin:coupons", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();
    const coupons = await AdminService.listCoupons();
    await ctx.reply(
      `${coupons.map((coupon) => `🎟 ${coupon.code} | ${coupon.discountPercent}% | ${coupon.usedCount}/${coupon.maxUses}`).join("\n") || "کوپنی وجود ندارد."}\n\nبرای ایجاد کوپن جدید دکمه زیر را بزنید.`,
      Markup.inlineKeyboard([[Markup.button.callback("➕ کوپن جدید", "admin:coupon:create")], [Markup.button.callback("⬅️ بازگشت", "admin:dashboard")]]),
    );
  });

  bot.action("admin:coupon:create", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();
    setFlow(ctx, { flow: "coupon_create", step: "code", data: {} });
    await ctx.reply("🎟 کد کوپن را ارسال کنید:", navigationKeyboard("admin:dashboard"));
  });

  bot.action("admin:tickets", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();
    const tickets = await AdminService.listOpenTickets();
    await ctx.reply(
      "تیکت‌های باز:",
      Markup.inlineKeyboard([...tickets.map((ticket) => [Markup.button.callback(`🎧 ${ticket.user.telegramId} - ${ticket.id.slice(-6)}`, `admin:ticket:${ticket.id}`)]), [Markup.button.callback("⬅️ بازگشت", "admin:dashboard")]]),
    );
  });

  bot.action(/^admin:ticket:([^:]+)$/, async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();
    const ticket = await SupportService.getTicketWithUser(ctx.match[1]);
    if (!ticket) {
      await ctx.reply("تیکت پیدا نشد.", navigationKeyboard("admin:tickets"));
      return;
    }
    ctx.session.liveTicketId = ticket.id;
    const history = ticket.messages.map((message) => `${message.senderRole === "admin" ? "ادمین" : "کاربر"}: ${message.message}`).join("\n") || "بدون پیام";
    await ctx.reply(
      `🎧 تیکت ${ticket.id}\nکاربر: ${ticket.user.telegramId}\n\n${history}\n\n💬 حالت گفتگوی زنده فعال شد. هر پیام شما مستقیم داخل همین تیکت ارسال می‌شود.`,
      Markup.inlineKeyboard([[Markup.button.callback("✅ بستن تیکت", `admin:ticket:close:${ticket.id}`)], [Markup.button.callback("🚪 خروج از چت", "admin:ticket:leave"), Markup.button.callback("⬅️ بازگشت", "admin:tickets")]]),
    );
  });

  bot.action("admin:ticket:leave", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery("از حالت چت خارج شدید");
    ctx.session.liveTicketId = undefined;
    await ctx.reply("🚪 حالت گفتگوی زنده غیرفعال شد.", navigationKeyboard("admin:tickets"));
  });

  bot.action(/^admin:ticket:close:(.+)$/, async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();
    await SupportService.closeTicket(ctx.match[1], String(ctx.from.id));
    if (ctx.session.liveTicketId === ctx.match[1]) ctx.session.liveTicketId = undefined;
    await ctx.reply("✅ تیکت بسته شد.", navigationKeyboard("admin:tickets"));
  });

  bot.action("admin:orders", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();
    const orders = await AdminService.listRecentOrders();
    await ctx.reply(
      orders.map((order) => `🧾 ${order.id.slice(-6)} | ${order.user.telegramId} | ${order.product.title} | ${order.totalAmount.toLocaleString("fa-IR")}`).join("\n") || "سفارشی وجود ندارد.",
      navigationKeyboard("admin:dashboard"),
    );
  });
}
