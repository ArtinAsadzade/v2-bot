import { Markup } from "telegraf";
import type { AppBot, AppContext } from "../../../types/bot";
import { prisma } from "../../../services/prisma";
import { DepositService } from "../../../modules/deposit/deposit.service";
import { ProductService } from "../../../modules/product/product.service";
import { adminKeyboard } from "../../keyboards/admin.keyboard";
import { navigationKeyboard } from "../../keyboards/main.keyboard";
import { isAdminByTelegramId } from "../../middlewares/admin.middleware";

async function requireAdmin(ctx: AppContext) {
  if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) {
    await ctx.answerCbQuery?.("دسترسی غیرمجاز").catch(() => undefined);
    return false;
  }
  return true;
}

export function registerAdminHandlers(bot: AppBot) {
  bot.action("admin:dashboard", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();
    const [users, products, deposits, tickets, orders] = await Promise.all([
      prisma.user.count(),
      prisma.product.count(),
      prisma.deposit.count({ where: { status: "submitted" } }),
      prisma.ticket.count({ where: { status: "open" } }),
      prisma.order.count(),
    ]);
    await ctx.reply(
      `👨‍💼 پنل مدیریت\n\n👥 کاربران: ${users}\n📦 محصولات: ${products}\n💳 واریزی‌های در انتظار: ${deposits}\n🎧 تیکت‌های باز: ${tickets}\n🧾 سفارش‌ها: ${orders}`,
      adminKeyboard(),
    );
  });

  bot.action("admin:users", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();
    const users = await prisma.user.findMany({ orderBy: { createdAt: "desc" }, take: 10 });
    await ctx.reply(
      users.map((user) => `👤 ${user.telegramId} @${user.username ?? "-"} | ${user.balance.toLocaleString("fa-IR")} تومان`).join("\n") || "کاربری وجود ندارد.",
      navigationKeyboard("admin:dashboard"),
    );
  });

  bot.action("admin:products", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();
    const products = await prisma.product.findMany({ include: { category: true }, orderBy: { createdAt: "desc" }, take: 20 });
    const lines = await Promise.all(
      products.map(async (product) => {
        const stock = await ProductService.availableStock(product.id);
        return `📦 ${product.title} | ${product.category.name} | ${product.price.toLocaleString("fa-IR")} تومان | موجودی ${stock}`;
      }),
    );
    await ctx.reply(lines.join("\n") || "محصولی وجود ندارد.", navigationKeyboard("admin:dashboard"));
  });

  bot.action("admin:product:create", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();
    ctx.session.state = { name: "admin_product_create" };
    await ctx.reply("اطلاعات محصول را با فرمت زیر ارسال کنید:\n\nدسته|عنوان|قیمت|مدت-روز", navigationKeyboard("admin:dashboard"));
  });

  bot.action("admin:accounts", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();
    const products = await prisma.product.findMany({ where: { isActive: true }, orderBy: { title: "asc" } });
    await ctx.reply(
      "برای کدام محصول اکانت اضافه شود؟",
      Markup.inlineKeyboard([
        ...products.map((product) => [Markup.button.callback(product.title, `admin:account:create:${product.id}`)]),
        [Markup.button.callback("⬅️ بازگشت", "admin:dashboard")],
      ]),
    );
  });

  bot.action(/^admin:account:create:(.+)$/, async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();
    ctx.session.state = { name: "admin_account_create", productId: ctx.match[1] };
    await ctx.reply("اطلاعات اکانت را با فرمت زیر ارسال کنید:\n\nنام‌کاربری|رمزعبور|کانفیگ", navigationKeyboard("admin:dashboard"));
  });

  bot.action("admin:deposits", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();
    const deposits = await prisma.deposit.findMany({ where: { status: "submitted" }, include: { user: true }, orderBy: { createdAt: "asc" }, take: 10 });
    if (deposits.length === 0) {
      await ctx.reply("واریزی در انتظار بررسی وجود ندارد.", navigationKeyboard("admin:dashboard"));
      return;
    }
    for (const deposit of deposits) {
      const messageOptions = {
        reply_markup: {
          inline_keyboard: [[{ text: "✅ تایید", callback_data: `admin:deposit:approve:${deposit.id}` }, { text: "❌ رد", callback_data: `admin:deposit:reject:${deposit.id}` }]],
        },
      };
      const caption = `💳 واریزی\nکاربر: ${deposit.user.telegramId}\nمبلغ: ${deposit.amount.toLocaleString("fa-IR")} تومان\nارز: ${deposit.cryptoType}`;
      if (deposit.receipt) {
        await ctx.replyWithPhoto(deposit.receipt, { caption, ...messageOptions });
      } else {
        await ctx.reply(caption, messageOptions);
      }
    }
  });

  bot.action(/^admin:deposit:(approve|reject):(.+)$/, async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();
    const action = ctx.match[1];
    const depositId = ctx.match[2];
    try {
      const deposit = action === "approve" ? await DepositService.approve(depositId, String(ctx.from.id)) : await DepositService.reject(depositId, String(ctx.from.id));
      await ctx.reply(action === "approve" ? "✅ واریزی تایید و کیف پول شارژ شد." : "❌ واریزی رد شد.", navigationKeyboard("admin:deposits"));
      await ctx.telegram.sendMessage(Number((await prisma.user.findUniqueOrThrow({ where: { id: deposit.userId } })).telegramId), action === "approve" ? `✅ شارژ ${deposit.amount.toLocaleString("fa-IR")} تومانی شما تایید شد.` : "❌ رسید شارژ شما رد شد.");
    } catch (error) {
      await ctx.reply(`❌ ${error instanceof Error ? error.message : "عملیات ناموفق بود"}`, navigationKeyboard("admin:deposits"));
    }
  });

  bot.action("admin:coupons", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();
    const coupons = await prisma.coupon.findMany({ orderBy: { createdAt: "desc" }, take: 10 });
    await ctx.reply(
      `${coupons.map((coupon) => `🎟 ${coupon.code} | ${coupon.discountPercent}% | ${coupon.usedCount}/${coupon.maxUses}`).join("\n") || "کوپنی وجود ندارد."}\n\nبرای ایجاد کوپن جدید دکمه زیر را بزنید.`,
      Markup.inlineKeyboard([[Markup.button.callback("➕ کوپن جدید", "admin:coupon:create")], [Markup.button.callback("⬅️ بازگشت", "admin:dashboard")]]),
    );
  });

  bot.action("admin:coupon:create", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();
    ctx.session.state = { name: "admin_coupon_create" };
    await ctx.reply("کوپن را با فرمت زیر ارسال کنید:\n\nCODE درصد تعداد_استفاده روزهای_اعتبار", navigationKeyboard("admin:dashboard"));
  });

  bot.action("admin:tickets", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();
    const tickets = await prisma.ticket.findMany({ where: { status: "open" }, include: { user: true }, orderBy: { createdAt: "asc" }, take: 10 });
    await ctx.reply(
      "تیکت‌های باز:",
      Markup.inlineKeyboard([
        ...tickets.map((ticket) => [Markup.button.callback(`🎧 ${ticket.user.telegramId} - ${ticket.id.slice(-6)}`, `admin:ticket:${ticket.id}`)]),
        [Markup.button.callback("⬅️ بازگشت", "admin:dashboard")],
      ]),
    );
  });

  bot.action(/^admin:ticket:(.+)$/, async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();
    const ticket = await prisma.ticket.findUnique({ where: { id: ctx.match[1] }, include: { user: true, messages: { orderBy: { createdAt: "asc" } } } });
    if (!ticket) {
      await ctx.reply("تیکت پیدا نشد.", navigationKeyboard("admin:tickets"));
      return;
    }
    ctx.session.state = { name: "admin_ticket_reply", ticketId: ticket.id };
    await ctx.reply(
      `🎧 تیکت ${ticket.id}\nکاربر: ${ticket.user.telegramId}\n\n${ticket.messages.map((message) => `${message.senderRole === "admin" ? "ادمین" : "کاربر"}: ${message.message}`).join("\n") || "بدون پیام"}\n\nپاسخ خود را ارسال کنید:`,
      navigationKeyboard("admin:tickets"),
    );
  });

  bot.action("admin:orders", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();
    const orders = await prisma.order.findMany({ include: { user: true, product: true }, orderBy: { createdAt: "desc" }, take: 10 });
    await ctx.reply(
      orders.map((order) => `🧾 ${order.id.slice(-6)} | ${order.user.telegramId} | ${order.product.title} | ${order.totalAmount.toLocaleString("fa-IR")}`).join("\n") || "سفارشی وجود ندارد.",
      navigationKeyboard("admin:dashboard"),
    );
  });
}
