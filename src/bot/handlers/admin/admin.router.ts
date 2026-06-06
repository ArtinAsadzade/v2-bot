import { Markup } from "telegraf";
import { requireAdmin } from "./admin.guard";
import { setFlow } from "./admin.flow";
import { prisma } from "../../../services/prisma";

export function registerAdminHandlers(bot: any) {
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
      `👨‍💼 Admin\n\n👥 Users: ${users}\n📦 Products: ${products}\n💳 Deposits: ${deposits}\n🎧 Tickets: ${tickets}\n🧾 Orders: ${orders}`,
      Markup.inlineKeyboard([
        [Markup.button.callback("Users", "admin:users")],
        [Markup.button.callback("Products", "admin:products")],
        [Markup.button.callback("Create Product", "admin:product:create")],
        [Markup.button.callback("Coupons", "admin:coupons")],
        [Markup.button.callback("Tickets", "admin:tickets")],
      ]),
    );
  });

  bot.action("admin:product:create", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;

    setFlow(ctx, {
      flow: "product_create",
      step: "title",
      data: {},
    });

    await ctx.answerCbQuery();
    await ctx.reply("📦 Send product title:");
  });

  bot.action("admin:coupon:create", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;

    setFlow(ctx, {
      flow: "coupon_create",
      step: "code",
      data: {},
    });

    await ctx.answerCbQuery();
    await ctx.reply("🎟 Send coupon code:");
  });

  bot.action("admin:accounts", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;

    const products = await prisma.product.findMany({
      where: { isActive: true },
      orderBy: { title: "asc" },
    });

    await ctx.reply("Select product:", Markup.inlineKeyboard(products.map((p) => [Markup.button.callback(p.title, `admin:account:create:${p.id}`)])));
  });

  bot.action(/^admin:account:create:(.+)$/, async (ctx) => {
    if (!(await requireAdmin(ctx))) return;

    setFlow(ctx, {
      flow: "account_create",
      step: "credentials",
      data: { productId: ctx.match[1] },
    });

    await ctx.answerCbQuery();
    await ctx.reply("👤 Send: username|password|config");
  });
}
