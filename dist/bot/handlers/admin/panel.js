"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerAdminHandlers = registerAdminHandlers;
// @ts-nocheck
const telegraf_1 = require("telegraf");
const deposit_service_1 = require("../../../modules/deposit/deposit.service");
const product_service_1 = require("../../../modules/product/product.service");
const support_service_1 = require("../../../modules/support/support.service");
const admin_service_1 = require("../../../modules/admin/admin.service");
const admin_keyboard_1 = require("../../keyboards/admin.keyboard");
const main_keyboard_1 = require("../../keyboards/main.keyboard");
const admin_middleware_1 = require("../../middlewares/admin.middleware");
const pagination_1 = require("../../../utils/pagination");
const admin_flow_1 = require("./admin.flow");
async function requireAdmin(ctx) {
    if (!ctx.from || !(await (0, admin_middleware_1.isAdminByTelegramId)(ctx.from.id))) {
        await ctx.answerCbQuery?.("دسترسی غیرمجاز").catch(() => undefined);
        return false;
    }
    return true;
}
function paginationKeyboard(prefix, page, totalPages, backTo = "admin:dashboard") {
    const rows = [];
    const nav = [];
    if (page > 1)
        nav.push(telegraf_1.Markup.button.callback("⬅️ قبلی", `${prefix}:page:${page - 1}`));
    if (page < totalPages)
        nav.push(telegraf_1.Markup.button.callback("بعدی ➡️", `${prefix}:page:${page + 1}`));
    if (nav.length)
        rows.push(nav);
    rows.push([telegraf_1.Markup.button.callback("🔎 جستجو", `${prefix}:search`), telegraf_1.Markup.button.callback("↩️ بازگشت", backTo)]);
    return telegraf_1.Markup.inlineKeyboard(rows);
}
function registerAdminHandlers(bot) {
    bot.action("admin:dashboard", async (ctx) => {
        if (!(await requireAdmin(ctx)))
            return;
        await ctx.answerCbQuery();
        const stats = await admin_service_1.AdminService.dashboard();
        await ctx.reply(`👨‍💼 پنل مدیریت\n\n👥 کاربران: ${stats.users.toLocaleString("fa-IR")}\n📦 محصولات: ${stats.products.toLocaleString("fa-IR")}\n💳 واریزی‌های در انتظار: ${stats.submittedDeposits.toLocaleString("fa-IR")}\n🎧 تیکت‌های باز: ${stats.openTickets.toLocaleString("fa-IR")}\n🧾 سفارش‌ها: ${stats.orders.toLocaleString("fa-IR")}\n💰 درآمد: ${stats.revenue.toLocaleString("fa-IR")} تومان`, (0, admin_keyboard_1.adminKeyboard)());
    });
    bot.action(["admin:users", /^admin:users:page:(\d+)$/], async (ctx) => {
        if (!(await requireAdmin(ctx)))
            return;
        await ctx.answerCbQuery();
        const page = "match" in ctx && ctx.match ? Number(ctx.match[1]) : 1;
        const { skip, take, pageSize } = (0, pagination_1.getPagination)(page);
        const [users, total] = await admin_service_1.AdminService.listUsers(skip, take);
        await ctx.reply(users.map((user) => `👤 ${user.telegramId} @${user.username ?? "-"} | ${user.balance.toLocaleString("fa-IR")} تومان`).join("\n") || "کاربری وجود ندارد.", paginationKeyboard("admin:users", page, (0, pagination_1.getTotalPages)(total, pageSize)));
    });
    bot.action("admin:users:search", async (ctx) => {
        if (!(await requireAdmin(ctx)))
            return;
        await ctx.answerCbQuery();
        ctx.session.state = { name: "admin_user_search" };
        await ctx.reply("🔎 شناسه تلگرام، نام کاربری یا نام کاربر را ارسال کنید:", (0, main_keyboard_1.navigationKeyboard)("admin:users"));
    });
    bot.action(["admin:products", /^admin:products:page:(\d+)$/], async (ctx) => {
        if (!(await requireAdmin(ctx)))
            return;
        await ctx.answerCbQuery();
        const page = "match" in ctx && ctx.match ? Number(ctx.match[1]) : 1;
        const { skip, take, pageSize } = (0, pagination_1.getPagination)(page);
        const [products, total] = await admin_service_1.AdminService.listProducts(skip, take);
        const lines = await Promise.all(products.map(async (product) => `📦 ${product.title} | ${product.category.name} | ${product.price.toLocaleString("fa-IR")} تومان | موجودی ${(await product_service_1.ProductService.availableStock(product.id)).toLocaleString("fa-IR")}`));
        await ctx.reply(lines.join("\n") || "محصولی وجود ندارد.", paginationKeyboard("admin:products", page, (0, pagination_1.getTotalPages)(total, pageSize)));
    });
    bot.action("admin:products:search", async (ctx) => {
        if (!(await requireAdmin(ctx)))
            return;
        await ctx.answerCbQuery();
        ctx.session.state = { name: "admin_product_search" };
        await ctx.reply("🔎 عنوان محصول یا نام دسته‌بندی را ارسال کنید:", (0, main_keyboard_1.navigationKeyboard)("admin:products"));
    });
    bot.action("admin:product:create", async (ctx) => {
        if (!(await requireAdmin(ctx)))
            return;
        await ctx.answerCbQuery();
        (0, admin_flow_1.setFlow)(ctx, { flow: "product_create", step: "title", data: {} });
        await ctx.reply("📦 نام محصول را ارسال کنید:", (0, main_keyboard_1.navigationKeyboard)("admin:dashboard"));
    });
    bot.action("admin:accounts", async (ctx) => {
        if (!(await requireAdmin(ctx)))
            return;
        await ctx.answerCbQuery();
        const products = await product_service_1.ProductService.listActiveProducts(25);
        await ctx.reply("برای کدام محصول اکانت اضافه شود؟", telegraf_1.Markup.inlineKeyboard([...products.map((product) => [telegraf_1.Markup.button.callback(product.title, `admin:account:create:${product.id}`)]), [telegraf_1.Markup.button.callback("⬅️ بازگشت", "admin:dashboard")]]));
    });
    bot.action(/^admin:account:create:(.+)$/, async (ctx) => {
        if (!(await requireAdmin(ctx)))
            return;
        await ctx.answerCbQuery();
        (0, admin_flow_1.setFlow)(ctx, { flow: "account_create", step: "username", data: { productId: ctx.match[1] } });
        await ctx.reply("👤 نام کاربری اکانت را ارسال کنید:", (0, main_keyboard_1.navigationKeyboard)("admin:dashboard"));
    });
    bot.action("admin:deposits", async (ctx) => {
        if (!(await requireAdmin(ctx)))
            return;
        await ctx.answerCbQuery();
        const deposits = await admin_service_1.AdminService.listSubmittedDeposits();
        if (deposits.length === 0) {
            await ctx.reply("واریزی در انتظار بررسی وجود ندارد.", (0, main_keyboard_1.navigationKeyboard)("admin:dashboard"));
            return;
        }
        for (const deposit of deposits) {
            const buttons = telegraf_1.Markup.inlineKeyboard([[telegraf_1.Markup.button.callback("✅ تایید", `admin:deposit:approve:${deposit.id}`), telegraf_1.Markup.button.callback("❌ رد", `admin:deposit:reject:${deposit.id}`)]]);
            const caption = `💳 واریزی\nکاربر: ${deposit.user.telegramId}\nمبلغ: ${deposit.amount.toLocaleString("fa-IR")} تومان\nارز: ${deposit.cryptoType}`;
            if (deposit.receipt)
                await ctx.replyWithPhoto(deposit.receipt, { caption, ...buttons });
            else
                await ctx.reply(caption, buttons);
        }
    });
    bot.action(/^admin:deposit:(approve|reject):(.+)$/, async (ctx) => {
        if (!(await requireAdmin(ctx)))
            return;
        await ctx.answerCbQuery();
        const action = ctx.match[1];
        const depositId = ctx.match[2];
        try {
            await (action === "approve" ? deposit_service_1.DepositService.approve(depositId, String(ctx.from.id)) : deposit_service_1.DepositService.reject(depositId, String(ctx.from.id)));
            admin_service_1.AdminService.invalidateDashboardCache();
            await ctx.reply(action === "approve" ? "✅ واریزی تایید و کیف پول شارژ شد." : "❌ واریزی رد شد.", (0, main_keyboard_1.navigationKeyboard)("admin:deposits"));
        }
        catch (error) {
            await ctx.reply(`❌ ${error instanceof Error ? error.message : "عملیات ناموفق بود"}`, (0, main_keyboard_1.navigationKeyboard)("admin:deposits"));
        }
    });
    bot.action("admin:coupons", async (ctx) => {
        if (!(await requireAdmin(ctx)))
            return;
        await ctx.answerCbQuery();
        const coupons = await admin_service_1.AdminService.listCoupons();
        await ctx.reply(`${coupons.map((coupon) => `🎟 ${coupon.code} | ${coupon.discountPercent}% | ${coupon.usedCount}/${coupon.maxUses}`).join("\n") || "کوپنی وجود ندارد."}\n\nبرای ایجاد کوپن جدید دکمه زیر را بزنید.`, telegraf_1.Markup.inlineKeyboard([[telegraf_1.Markup.button.callback("➕ کوپن جدید", "admin:coupon:create")], [telegraf_1.Markup.button.callback("⬅️ بازگشت", "admin:dashboard")]]));
    });
    bot.action("admin:coupon:create", async (ctx) => {
        if (!(await requireAdmin(ctx)))
            return;
        await ctx.answerCbQuery();
        (0, admin_flow_1.setFlow)(ctx, { flow: "coupon_create", step: "code", data: {} });
        await ctx.reply("🎟 کد کوپن را ارسال کنید:", (0, main_keyboard_1.navigationKeyboard)("admin:dashboard"));
    });
    bot.action("admin:tickets", async (ctx) => {
        if (!(await requireAdmin(ctx)))
            return;
        await ctx.answerCbQuery();
        const tickets = await admin_service_1.AdminService.listOpenTickets();
        await ctx.reply("تیکت‌های باز:", telegraf_1.Markup.inlineKeyboard([...tickets.map((ticket) => [telegraf_1.Markup.button.callback(`🎧 ${ticket.user.telegramId} - ${ticket.id.slice(-6)}`, `admin:ticket:${ticket.id}`)]), [telegraf_1.Markup.button.callback("⬅️ بازگشت", "admin:dashboard")]]));
    });
    bot.action(/^admin:ticket:([^:]+)$/, async (ctx) => {
        if (!(await requireAdmin(ctx)))
            return;
        await ctx.answerCbQuery();
        const ticket = await support_service_1.SupportService.getTicketWithUser(ctx.match[1]);
        if (!ticket) {
            await ctx.reply("تیکت پیدا نشد.", (0, main_keyboard_1.navigationKeyboard)("admin:tickets"));
            return;
        }
        ctx.session.liveTicketId = ticket.id;
        const history = ticket.messages.map((message) => `${message.senderRole === "admin" ? "ادمین" : "کاربر"}: ${message.message}`).join("\n") || "بدون پیام";
        await ctx.reply(`🎧 تیکت ${ticket.id}\nکاربر: ${ticket.user.telegramId}\n\n${history}\n\n💬 حالت گفتگوی زنده فعال شد. هر پیام شما مستقیم داخل همین تیکت ارسال می‌شود.`, telegraf_1.Markup.inlineKeyboard([[telegraf_1.Markup.button.callback("✅ بستن تیکت", `admin:ticket:close:${ticket.id}`)], [telegraf_1.Markup.button.callback("🚪 خروج از چت", "admin:ticket:leave"), telegraf_1.Markup.button.callback("⬅️ بازگشت", "admin:tickets")]]));
    });
    bot.action("admin:ticket:leave", async (ctx) => {
        if (!(await requireAdmin(ctx)))
            return;
        await ctx.answerCbQuery("از حالت چت خارج شدید");
        ctx.session.liveTicketId = undefined;
        await ctx.reply("🚪 حالت گفتگوی زنده غیرفعال شد.", (0, main_keyboard_1.navigationKeyboard)("admin:tickets"));
    });
    bot.action(/^admin:ticket:close:(.+)$/, async (ctx) => {
        if (!(await requireAdmin(ctx)))
            return;
        await ctx.answerCbQuery();
        await support_service_1.SupportService.closeTicket(ctx.match[1], String(ctx.from.id));
        if (ctx.session.liveTicketId === ctx.match[1])
            ctx.session.liveTicketId = undefined;
        await ctx.reply("✅ تیکت بسته شد.", (0, main_keyboard_1.navigationKeyboard)("admin:tickets"));
    });
    bot.action("admin:orders", async (ctx) => {
        if (!(await requireAdmin(ctx)))
            return;
        await ctx.answerCbQuery();
        const orders = await admin_service_1.AdminService.listRecentOrders();
        await ctx.reply(orders.map((order) => `🧾 ${order.id.slice(-6)} | ${order.user.telegramId} | ${order.product.title} | ${order.totalAmount.toLocaleString("fa-IR")}`).join("\n") || "سفارشی وجود ندارد.", (0, main_keyboard_1.navigationKeyboard)("admin:dashboard"));
    });
}
