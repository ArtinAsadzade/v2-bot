"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerAdminHandlers = registerAdminHandlers;
const telegraf_1 = require("telegraf");
const prisma_1 = require("../../../services/prisma");
const deposit_service_1 = require("../../../modules/deposit/deposit.service");
const product_service_1 = require("../../../modules/product/product.service");
const admin_keyboard_1 = require("../../keyboards/admin.keyboard");
const main_keyboard_1 = require("../../keyboards/main.keyboard");
const admin_middleware_1 = require("../../middlewares/admin.middleware");
async function requireAdmin(ctx) {
    if (!ctx.from || !(await (0, admin_middleware_1.isAdminByTelegramId)(ctx.from.id))) {
        await ctx.answerCbQuery?.("دسترسی غیرمجاز").catch(() => undefined);
        return false;
    }
    return true;
}
function registerAdminHandlers(bot) {
    bot.action("admin:dashboard", async (ctx) => {
        if (!(await requireAdmin(ctx)))
            return;
        await ctx.answerCbQuery();
        const [users, products, deposits, tickets, orders] = await Promise.all([
            prisma_1.prisma.user.count(),
            prisma_1.prisma.product.count(),
            prisma_1.prisma.deposit.count({ where: { status: "submitted" } }),
            prisma_1.prisma.ticket.count({ where: { status: "open" } }),
            prisma_1.prisma.order.count(),
        ]);
        await ctx.reply(`👨‍💼 پنل مدیریت\n\n👥 کاربران: ${users}\n📦 محصولات: ${products}\n💳 واریزی‌های در انتظار: ${deposits}\n🎧 تیکت‌های باز: ${tickets}\n🧾 سفارش‌ها: ${orders}`, (0, admin_keyboard_1.adminKeyboard)());
    });
    bot.action("admin:users", async (ctx) => {
        if (!(await requireAdmin(ctx)))
            return;
        await ctx.answerCbQuery();
        const users = await prisma_1.prisma.user.findMany({ orderBy: { createdAt: "desc" }, take: 10 });
        await ctx.reply(users.map((user) => `👤 ${user.telegramId} @${user.username ?? "-"} | ${user.balance.toLocaleString("fa-IR")} تومان`).join("\n") || "کاربری وجود ندارد.", (0, main_keyboard_1.navigationKeyboard)("admin:dashboard"));
    });
    bot.action("admin:products", async (ctx) => {
        if (!(await requireAdmin(ctx)))
            return;
        await ctx.answerCbQuery();
        const products = await prisma_1.prisma.product.findMany({ include: { category: true }, orderBy: { createdAt: "desc" }, take: 20 });
        const lines = await Promise.all(products.map(async (product) => {
            const stock = await product_service_1.ProductService.availableStock(product.id);
            return `📦 ${product.title} | ${product.category.name} | ${product.price.toLocaleString("fa-IR")} تومان | موجودی ${stock}`;
        }));
        await ctx.reply(lines.join("\n") || "محصولی وجود ندارد.", (0, main_keyboard_1.navigationKeyboard)("admin:dashboard"));
    });
    bot.action("admin:product:create", async (ctx) => {
        if (!(await requireAdmin(ctx)))
            return;
        await ctx.answerCbQuery();
        ctx.session.state = { name: "admin_product_create" };
        await ctx.reply("اطلاعات محصول را با فرمت زیر ارسال کنید:\n\nدسته|عنوان|قیمت|مدت-روز", (0, main_keyboard_1.navigationKeyboard)("admin:dashboard"));
    });
    bot.action("admin:accounts", async (ctx) => {
        if (!(await requireAdmin(ctx)))
            return;
        await ctx.answerCbQuery();
        const products = await prisma_1.prisma.product.findMany({ where: { isActive: true }, orderBy: { title: "asc" } });
        await ctx.reply("برای کدام محصول اکانت اضافه شود؟", telegraf_1.Markup.inlineKeyboard([
            ...products.map((product) => [telegraf_1.Markup.button.callback(product.title, `admin:account:create:${product.id}`)]),
            [telegraf_1.Markup.button.callback("⬅️ بازگشت", "admin:dashboard")],
        ]));
    });
    bot.action(/^admin:account:create:(.+)$/, async (ctx) => {
        if (!(await requireAdmin(ctx)))
            return;
        await ctx.answerCbQuery();
        ctx.session.state = { name: "admin_account_create", productId: ctx.match[1] };
        await ctx.reply("اطلاعات اکانت را با فرمت زیر ارسال کنید:\n\nنام‌کاربری|رمزعبور|کانفیگ", (0, main_keyboard_1.navigationKeyboard)("admin:dashboard"));
    });
    bot.action("admin:deposits", async (ctx) => {
        if (!(await requireAdmin(ctx)))
            return;
        await ctx.answerCbQuery();
        const deposits = await prisma_1.prisma.deposit.findMany({ where: { status: "submitted" }, include: { user: true }, orderBy: { createdAt: "asc" }, take: 10 });
        if (deposits.length === 0) {
            await ctx.reply("واریزی در انتظار بررسی وجود ندارد.", (0, main_keyboard_1.navigationKeyboard)("admin:dashboard"));
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
            }
            else {
                await ctx.reply(caption, messageOptions);
            }
        }
    });
    bot.action(/^admin:deposit:(approve|reject):(.+)$/, async (ctx) => {
        if (!(await requireAdmin(ctx)))
            return;
        await ctx.answerCbQuery();
        const action = ctx.match[1];
        const depositId = ctx.match[2];
        try {
            const deposit = action === "approve" ? await deposit_service_1.DepositService.approve(depositId, String(ctx.from.id)) : await deposit_service_1.DepositService.reject(depositId, String(ctx.from.id));
            await ctx.reply(action === "approve" ? "✅ واریزی تایید و کیف پول شارژ شد." : "❌ واریزی رد شد.", (0, main_keyboard_1.navigationKeyboard)("admin:deposits"));
            await ctx.telegram.sendMessage(Number((await prisma_1.prisma.user.findUniqueOrThrow({ where: { id: deposit.userId } })).telegramId), action === "approve" ? `✅ شارژ ${deposit.amount.toLocaleString("fa-IR")} تومانی شما تایید شد.` : "❌ رسید شارژ شما رد شد.");
        }
        catch (error) {
            await ctx.reply(`❌ ${error instanceof Error ? error.message : "عملیات ناموفق بود"}`, (0, main_keyboard_1.navigationKeyboard)("admin:deposits"));
        }
    });
    bot.action("admin:coupons", async (ctx) => {
        if (!(await requireAdmin(ctx)))
            return;
        await ctx.answerCbQuery();
        const coupons = await prisma_1.prisma.coupon.findMany({ orderBy: { createdAt: "desc" }, take: 10 });
        await ctx.reply(`${coupons.map((coupon) => `🎟 ${coupon.code} | ${coupon.discountPercent}% | ${coupon.usedCount}/${coupon.maxUses}`).join("\n") || "کوپنی وجود ندارد."}\n\nبرای ایجاد کوپن جدید دکمه زیر را بزنید.`, telegraf_1.Markup.inlineKeyboard([[telegraf_1.Markup.button.callback("➕ کوپن جدید", "admin:coupon:create")], [telegraf_1.Markup.button.callback("⬅️ بازگشت", "admin:dashboard")]]));
    });
    bot.action("admin:coupon:create", async (ctx) => {
        if (!(await requireAdmin(ctx)))
            return;
        await ctx.answerCbQuery();
        ctx.session.state = { name: "admin_coupon_create" };
        await ctx.reply("کوپن را با فرمت زیر ارسال کنید:\n\nCODE درصد تعداد_استفاده روزهای_اعتبار", (0, main_keyboard_1.navigationKeyboard)("admin:dashboard"));
    });
    bot.action("admin:tickets", async (ctx) => {
        if (!(await requireAdmin(ctx)))
            return;
        await ctx.answerCbQuery();
        const tickets = await prisma_1.prisma.ticket.findMany({ where: { status: "open" }, include: { user: true }, orderBy: { createdAt: "asc" }, take: 10 });
        await ctx.reply("تیکت‌های باز:", telegraf_1.Markup.inlineKeyboard([
            ...tickets.map((ticket) => [telegraf_1.Markup.button.callback(`🎧 ${ticket.user.telegramId} - ${ticket.id.slice(-6)}`, `admin:ticket:${ticket.id}`)]),
            [telegraf_1.Markup.button.callback("⬅️ بازگشت", "admin:dashboard")],
        ]));
    });
    bot.action(/^admin:ticket:(.+)$/, async (ctx) => {
        if (!(await requireAdmin(ctx)))
            return;
        await ctx.answerCbQuery();
        const ticket = await prisma_1.prisma.ticket.findUnique({ where: { id: ctx.match[1] }, include: { user: true, messages: { orderBy: { createdAt: "asc" } } } });
        if (!ticket) {
            await ctx.reply("تیکت پیدا نشد.", (0, main_keyboard_1.navigationKeyboard)("admin:tickets"));
            return;
        }
        ctx.session.state = { name: "admin_ticket_reply", ticketId: ticket.id };
        await ctx.reply(`🎧 تیکت ${ticket.id}\nکاربر: ${ticket.user.telegramId}\n\n${ticket.messages.map((message) => `${message.senderRole === "admin" ? "ادمین" : "کاربر"}: ${message.message}`).join("\n") || "بدون پیام"}\n\nپاسخ خود را ارسال کنید:`, (0, main_keyboard_1.navigationKeyboard)("admin:tickets"));
    });
    bot.action("admin:orders", async (ctx) => {
        if (!(await requireAdmin(ctx)))
            return;
        await ctx.answerCbQuery();
        const orders = await prisma_1.prisma.order.findMany({ include: { user: true, product: true }, orderBy: { createdAt: "desc" }, take: 10 });
        await ctx.reply(orders.map((order) => `🧾 ${order.id.slice(-6)} | ${order.user.telegramId} | ${order.product.title} | ${order.totalAmount.toLocaleString("fa-IR")}`).join("\n") || "سفارشی وجود ندارد.", (0, main_keyboard_1.navigationKeyboard)("admin:dashboard"));
    });
}
