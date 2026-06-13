"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerAdminHandlers = registerAdminHandlers;
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
function actor(ctx) {
    return String(ctx.from?.id ?? "system");
}
function statusFa(value) {
    if (typeof value === "boolean")
        return value ? "فعال" : "غیرفعال";
    return { active: "فعال", inactive: "غیرفعال", available: "AVAILABLE", reserved: "RESERVED", sold: "SOLD", disabled: "DISABLED", expired: "EXPIRED" }[String(value)] ?? String(value ?? "-");
}
function dateFa(date) {
    return date ? new Intl.DateTimeFormat("fa-IR", { dateStyle: "short", timeStyle: "short" }).format(date) : "-";
}
function userLabel(user) {
    if (!user)
        return "-";
    return [user.firstName, user.username ? `@${user.username}` : undefined, user.telegramId].filter(Boolean).join(" · ");
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
function confirmKeyboard(confirmAction, cancelAction) {
    return telegraf_1.Markup.inlineKeyboard([[telegraf_1.Markup.button.callback("✅ تایید", confirmAction), telegraf_1.Markup.button.callback("❌ انصراف", cancelAction)]]);
}
function entityListKeyboard(rows, prefix, page, total, pageSize, backTo = "admin:dashboard", extra = []) {
    const totalPages = (0, pagination_1.getTotalPages)(total, pageSize);
    const nav = [];
    if (page > 1)
        nav.push(telegraf_1.Markup.button.callback("⬅️ قبلی", `${prefix}:page:${page - 1}`));
    if (page < totalPages)
        nav.push(telegraf_1.Markup.button.callback("بعدی ➡️", `${prefix}:page:${page + 1}`));
    return telegraf_1.Markup.inlineKeyboard([...extra, ...rows, ...(nav.length ? [nav] : []), [telegraf_1.Markup.button.callback("🔎 جستجو", `${prefix}:search`), telegraf_1.Markup.button.callback("↩️ بازگشت", backTo)]]);
}
function productInputHelp() {
    return "هر خط را به شکل key:value ارسال کنید.\nمثال:\ntitle:VIP\nprice:250000\nduration:30\ncategoryId: شناسه دسته\nactive:true";
}
function categoryInputHelp() {
    return "هر خط را به شکل key:value ارسال کنید.\nمثال:\ntitle:VIP\ndescription:اکانت‌های ویژه\nicon:📂\norder:1\nactive:true";
}
function walletInputHelp() {
    return "هر خط را به شکل key:value ارسال کنید.\nمثال:\ncoinName:USDT\nsymbol:USDT\nnetwork:TRC20\ndisplayName:Tether TRC20\naddress:TX...\norder:1\nactive:true";
}
function accountInputHelp() {
    return "هر خط را به شکل key:value ارسال کنید.\nمثال:\nusername:user1\nsubscriptionLink:https://...\nconfigLink:vless://...\nproductId:شناسه محصول مقصد برای انتقال\nstatus:available";
}
function inventoryStatsLine(stats) {
    return `کل: ${stats.total.toLocaleString("fa-IR")} | آماده: ${stats.available.toLocaleString("fa-IR")} | رزرو: ${stats.reserved.toLocaleString("fa-IR")} | فروخته: ${stats.sold.toLocaleString("fa-IR")} | غیرفعال: ${stats.disabled.toLocaleString("fa-IR")} | منقضی: ${stats.expired.toLocaleString("fa-IR")}`;
}
function accountStatusFilterKeyboard(currentStatus) {
    const statuses = [["available", "✅ آماده"], ["reserved", "⏳ رزرو"], ["sold", "💰 فروخته"], ["disabled", "⏸ غیرفعال"], ["expired", "⌛ منقضی"]];
    return statuses.map(([status, label]) => telegraf_1.Markup.button.callback(`${currentStatus === status ? "• " : ""}${label}`, `admin:accounts:status:${status}:page:1`));
}
function registerAdminHandlers(bot) {
    bot.action("admin:dashboard", async (ctx) => {
        if (!(await requireAdmin(ctx)))
            return;
        await ctx.answerCbQuery();
        const stats = await admin_service_1.AdminService.dashboard();
        await ctx.reply(`👨‍💼 پنل مدیریت\n\n👥 کاربران: ${stats.users.toLocaleString("fa-IR")}\n📂 دسته‌بندی‌ها: ${stats.categories.toLocaleString("fa-IR")}\n📦 محصولات: ${stats.products.toLocaleString("fa-IR")}\n🗄 موجودی کل: ${stats.totalAccounts.toLocaleString("fa-IR")}\n✅ آماده: ${stats.availableAccounts.toLocaleString("fa-IR")} | ⏳ رزرو: ${stats.reservedAccounts.toLocaleString("fa-IR")} | 💰 فروخته: ${stats.soldAccounts.toLocaleString("fa-IR")} | ⏸ غیرفعال: ${stats.disabledAccounts.toLocaleString("fa-IR")} | ⌛ منقضی: ${stats.expiredAccounts.toLocaleString("fa-IR")}\n💳 کیف پول‌ها: ${stats.wallets.toLocaleString("fa-IR")}\n💳 واریزی‌های در انتظار: ${stats.submittedDeposits.toLocaleString("fa-IR")}\n🎧 تیکت‌های باز: ${stats.openTickets.toLocaleString("fa-IR")}\n🧾 سفارش‌ها: ${stats.orders.toLocaleString("fa-IR")}\n💰 درآمد: ${stats.revenue.toLocaleString("fa-IR")} تومان`, (0, admin_keyboard_1.adminKeyboard)());
    });
    bot.action(["admin:users", /^admin:users:page:(\d+)$/], async (ctx) => {
        if (!(await requireAdmin(ctx)))
            return;
        await ctx.answerCbQuery();
        const page = "match" in ctx && ctx.match ? Number(ctx.match[1]) : 1;
        const { take, pageSize } = (0, pagination_1.getPagination)(page);
        const [users, total] = await admin_service_1.AdminService.listUsers(page, take);
        await ctx.reply(users.map((user) => `👤 ${user.telegramId} @${user.username ?? "-"} | ${user.balance.toLocaleString("fa-IR")} تومان`).join("\n") || "کاربری وجود ندارد.", paginationKeyboard("admin:users", page, (0, pagination_1.getTotalPages)(total, pageSize)));
    });
    bot.action("admin:users:search", async (ctx) => {
        if (!(await requireAdmin(ctx)))
            return;
        await ctx.answerCbQuery();
        ctx.session.state = { name: "admin_user_search" };
        await ctx.reply("🔎 شناسه تلگرام، نام کاربری یا نام کاربر را ارسال کنید:", (0, main_keyboard_1.navigationKeyboard)("admin:users"));
    });
    bot.action(["admin:categories", /^admin:categories:page:(\d+)$/], async (ctx) => {
        if (!(await requireAdmin(ctx)))
            return;
        await ctx.answerCbQuery();
        const page = "match" in ctx && ctx.match ? Number(ctx.match[1]) : 1;
        const { take, pageSize } = (0, pagination_1.getPagination)(page);
        const [categories, total] = await admin_service_1.AdminService.listCategories(page, take);
        const text = `📂 مدیریت دسته‌بندی‌ها\n📊 تعداد: ${total.toLocaleString("fa-IR")}\n\n${categories.map((category) => `${category.icon ?? "📂"} ${category.name} | ${statusFa(category.isActive)} | ترتیب ${category.displayOrder.toLocaleString("fa-IR")} | محصول ${category._count.products.toLocaleString("fa-IR")} | فعال ${category.activeProductCount.toLocaleString("fa-IR")}`).join("\n") || "دسته‌بندی وجود ندارد."}`;
        await ctx.reply(text, entityListKeyboard(categories.map((category) => [telegraf_1.Markup.button.callback(`👁 ${category.name}`, `admin:category:${category.id}`)]), "admin:categories", page, total, pageSize, "admin:dashboard", [[telegraf_1.Markup.button.callback("➕ ایجاد دسته‌بندی", "admin:category:create")]]));
    });
    bot.action("admin:categories:search", async (ctx) => {
        if (!(await requireAdmin(ctx)))
            return;
        await ctx.answerCbQuery();
        ctx.session.state = { name: "admin_category_search" };
        await ctx.reply("🔎 عنوان یا توضیح دسته‌بندی را ارسال کنید:", (0, main_keyboard_1.navigationKeyboard)("admin:categories"));
    });
    bot.action("admin:category:create", async (ctx) => {
        if (!(await requireAdmin(ctx)))
            return;
        await ctx.answerCbQuery();
        (0, admin_flow_1.setFlow)(ctx, { flow: "category_create", step: "details", data: {} });
        await ctx.reply(`📂 ایجاد دسته‌بندی\n\n${categoryInputHelp()}`, (0, main_keyboard_1.navigationKeyboard)("admin:categories"));
    });
    bot.action([/^admin:category:([^:]+)$/, /^admin:category:products:([^:]+):page:(\d+)$/], async (ctx) => {
        if (!(await requireAdmin(ctx)))
            return;
        await ctx.answerCbQuery();
        const categoryId = ctx.match[1];
        const productPage = ctx.match[2] ? Number(ctx.match[2]) : 1;
        const detail = await admin_service_1.AdminService.categoryDetail(categoryId, productPage, 8);
        if (!detail.category)
            return void (await ctx.reply("دسته‌بندی پیدا نشد.", (0, main_keyboard_1.navigationKeyboard)("admin:categories")));
        const productTotalPages = (0, pagination_1.getTotalPages)(detail.productCount, detail.productTake);
        const products = detail.products.map((product) => `• ${product.title} | ${statusFa(product.isActive)} | فروش ${product._count.orders.toLocaleString("fa-IR")}`).join("\n") || "بدون محصول";
        const productNav = [];
        if (productPage > 1)
            productNav.push(telegraf_1.Markup.button.callback("⬅️ محصولات قبلی", `admin:category:products:${detail.category.id}:page:${productPage - 1}`));
        if (productPage < productTotalPages)
            productNav.push(telegraf_1.Markup.button.callback("محصولات بعدی ➡️", `admin:category:products:${detail.category.id}:page:${productPage + 1}`));
        await ctx.reply(`${detail.category.icon ?? "📂"} ${detail.category.name}\nتوضیحات: ${detail.category.description ?? "-"}\nترتیب نمایش: ${detail.category.displayOrder.toLocaleString("fa-IR")}\nوضعیت: ${statusFa(detail.category.isActive)}\n\n📊 آمار فروشگاه\nمحصولات: ${detail.productCount.toLocaleString("fa-IR")}\nمحصولات فعال: ${detail.activeProductCount.toLocaleString("fa-IR")}\nتعداد فروش: ${detail.salesCount.toLocaleString("fa-IR")}\n\n📦 محصولات داخل دسته (صفحه ${productPage.toLocaleString("fa-IR")} از ${productTotalPages.toLocaleString("fa-IR")}):\n${products}`, telegraf_1.Markup.inlineKeyboard([
            ...(productNav.length ? [productNav] : []),
            [telegraf_1.Markup.button.callback("✏️ ویرایش", `admin:category:edit:${detail.category.id}`), telegraf_1.Markup.button.callback(detail.category.isActive ? "⏸ غیرفعال" : "▶️ فعال", `admin:category:status:${detail.category.id}:${detail.category.isActive ? "off" : "on"}`)],
            [telegraf_1.Markup.button.callback("🗑 حذف نرم", `admin:category:delete:${detail.category.id}`), telegraf_1.Markup.button.callback("🔥 حذف دائمی", `admin:category:hard:${detail.category.id}`)],
            [telegraf_1.Markup.button.callback("⬅️ بازگشت", "admin:categories")],
        ]));
    });
    bot.action(/^admin:category:edit:(.+)$/, async (ctx) => {
        if (!(await requireAdmin(ctx)))
            return;
        await ctx.answerCbQuery();
        (0, admin_flow_1.setFlow)(ctx, { flow: "category_edit", step: "details", data: { categoryId: ctx.match[1] } });
        await ctx.reply(`✏️ ویرایش دسته‌بندی\n\n${categoryInputHelp()}`, (0, main_keyboard_1.navigationKeyboard)(`admin:category:${ctx.match[1]}`));
    });
    bot.action(/^admin:category:status:(.+):(on|off)$/, async (ctx) => {
        if (!(await requireAdmin(ctx)))
            return;
        await ctx.answerCbQuery();
        await admin_service_1.AdminService.setCategoryActive(ctx.match[1], ctx.match[2] === "on", actor(ctx));
        await ctx.reply("✅ وضعیت دسته‌بندی تغییر کرد.", (0, main_keyboard_1.navigationKeyboard)(`admin:category:${ctx.match[1]}`));
    });
    bot.action(/^admin:category:(delete|hard):(.+)$/, async (ctx) => {
        if (!(await requireAdmin(ctx)))
            return;
        await ctx.answerCbQuery();
        const hard = ctx.match[1] === "hard";
        await ctx.reply("⚠️ آیا از حذف این مورد مطمئن هستید؟", confirmKeyboard(`admin:category:${hard ? "hard-confirm" : "delete-confirm"}:${ctx.match[2]}`, `admin:category:${ctx.match[2]}`));
    });
    bot.action(/^admin:category:(delete-confirm|hard-confirm):(.+)$/, async (ctx) => {
        if (!(await requireAdmin(ctx)))
            return;
        await ctx.answerCbQuery();
        try {
            if (ctx.match[1] === "hard-confirm")
                await admin_service_1.AdminService.hardDeleteCategory(ctx.match[2], actor(ctx), true);
            else
                await admin_service_1.AdminService.deleteCategory(ctx.match[2], actor(ctx));
            await ctx.reply("✅ دسته‌بندی حذف شد.", (0, main_keyboard_1.navigationKeyboard)("admin:categories"));
        }
        catch (error) {
            await ctx.reply(`❌ ${error instanceof Error ? error.message : "حذف ناموفق بود"}`, (0, main_keyboard_1.navigationKeyboard)(`admin:category:${ctx.match[2]}`));
        }
    });
    bot.action(["admin:products", /^admin:products:page:(\d+)$/], async (ctx) => {
        if (!(await requireAdmin(ctx)))
            return;
        await ctx.answerCbQuery();
        const page = "match" in ctx && ctx.match ? Number(ctx.match[1]) : 1;
        const { take, pageSize } = (0, pagination_1.getPagination)(page);
        const [products, total] = await admin_service_1.AdminService.listProducts(page, take);
        const text = `📦 مدیریت محصولات\n📊 تعداد: ${total.toLocaleString("fa-IR")}\n\n${products.map((product) => `📦 ${product.title} | ${product.category?.name ?? "دسته‌بندی نامعتبر یا حذف‌شده"} | ${product.price.toLocaleString("fa-IR")} تومان | ${product.duration} روز | موجودی ${product.inventoryCount.toLocaleString("fa-IR")} | فروخته ${product.soldCount.toLocaleString("fa-IR")} | فعال ${product.activeCount.toLocaleString("fa-IR")} | ${statusFa(product.isActive)}`).join("\n") || "محصولی وجود ندارد."}`;
        await ctx.reply(text, entityListKeyboard(products.map((product) => [telegraf_1.Markup.button.callback(`👁 ${product.title}`, `admin:product:${product.id}`)]), "admin:products", page, total, pageSize, "admin:dashboard", [[telegraf_1.Markup.button.callback("➕ ایجاد محصول", "admin:product:create")]]));
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
        await ctx.reply("📦 نام محصول را ارسال کنید:", (0, main_keyboard_1.navigationKeyboard)("admin:products"));
    });
    bot.action(/^admin:product:([^:]+)$/, async (ctx) => {
        if (!(await requireAdmin(ctx)))
            return;
        await ctx.answerCbQuery();
        const detail = await admin_service_1.AdminService.productDetail(ctx.match[1]);
        if (!detail.product)
            return void (await ctx.reply("محصول پیدا نشد.", (0, main_keyboard_1.navigationKeyboard)("admin:products")));
        await ctx.reply(`📦 اطلاعات محصول\n\nنام: ${detail.product.title}\nدسته‌بندی: ${detail.product.category?.name ?? "دسته‌بندی نامعتبر یا حذف‌شده"}\nقیمت: ${detail.product.price.toLocaleString("fa-IR")} تومان\nمدت: ${detail.product.duration} روز\nوضعیت: ${statusFa(detail.product.isActive)}\nتاریخ ایجاد: ${dateFa(detail.product.createdAt)}\n\n📊 آمار موجودی\nکل: ${detail.product._count.accounts.toLocaleString("fa-IR")}\nآماده: ${detail.available.toLocaleString("fa-IR")}\nرزرو: ${detail.reserved.toLocaleString("fa-IR")}\nفروخته‌شده: ${detail.sold.toLocaleString("fa-IR")}\nغیرفعال: ${detail.disabled.toLocaleString("fa-IR")}\nمنقضی: ${detail.expired.toLocaleString("fa-IR")}\nسفارش موفق: ${detail.orderCount.toLocaleString("fa-IR")}\nدرآمد: ${detail.revenue.toLocaleString("fa-IR")} تومان`, telegraf_1.Markup.inlineKeyboard([
            [telegraf_1.Markup.button.callback("✏️ ویرایش", `admin:product:edit:${detail.product.id}`), telegraf_1.Markup.button.callback(detail.product.isActive ? "⏸ غیرفعال" : "▶️ فعال", `admin:product:status:${detail.product.id}:${detail.product.isActive ? "off" : "on"}`)],
            [telegraf_1.Markup.button.callback("🗄 اکانت‌های محصول", `admin:product:accounts:${detail.product.id}:page:1`), telegraf_1.Markup.button.callback("➕ افزودن اکانت", `admin:account:create:${detail.product.id}`)],
            [telegraf_1.Markup.button.callback("📋 کپی محصول", `admin:product:duplicate:${detail.product.id}`)],
            [telegraf_1.Markup.button.callback("🗑 حذف نرم", `admin:product:delete:${detail.product.id}`), telegraf_1.Markup.button.callback("🔥 حذف دائمی", `admin:product:hard:${detail.product.id}`)],
            [telegraf_1.Markup.button.callback("⬅️ بازگشت", "admin:products")],
        ]));
    });
    bot.action(/^admin:product:edit:(.+)$/, async (ctx) => {
        if (!(await requireAdmin(ctx)))
            return;
        await ctx.answerCbQuery();
        (0, admin_flow_1.setFlow)(ctx, { flow: "product_edit", step: "details", data: { productId: ctx.match[1] } });
        await ctx.reply(`✏️ ویرایش محصول\n\n${productInputHelp()}`, (0, main_keyboard_1.navigationKeyboard)(`admin:product:${ctx.match[1]}`));
    });
    bot.action(/^admin:product:status:(.+):(on|off)$/, async (ctx) => {
        if (!(await requireAdmin(ctx)))
            return;
        await ctx.answerCbQuery();
        await admin_service_1.AdminService.setProductActive(ctx.match[1], ctx.match[2] === "on", actor(ctx));
        await ctx.reply("✅ وضعیت محصول تغییر کرد.", (0, main_keyboard_1.navigationKeyboard)(`admin:product:${ctx.match[1]}`));
    });
    bot.action(/^admin:product:duplicate:(.+)$/, async (ctx) => {
        if (!(await requireAdmin(ctx)))
            return;
        await ctx.answerCbQuery();
        const product = await admin_service_1.AdminService.duplicateProduct(ctx.match[1], actor(ctx));
        await ctx.reply(`✅ محصول کپی شد: ${product.title}`, (0, main_keyboard_1.navigationKeyboard)(`admin:product:${product.id}`));
    });
    bot.action(/^admin:product:(delete|hard):(.+)$/, async (ctx) => {
        if (!(await requireAdmin(ctx)))
            return;
        await ctx.answerCbQuery();
        await ctx.reply("⚠️ آیا از حذف این مورد مطمئن هستید؟", confirmKeyboard(`admin:product:${ctx.match[1]}-confirm:${ctx.match[2]}`, `admin:product:${ctx.match[2]}`));
    });
    bot.action(/^admin:product:(delete-confirm|hard-confirm):(.+)$/, async (ctx) => {
        if (!(await requireAdmin(ctx)))
            return;
        await ctx.answerCbQuery();
        try {
            if (ctx.match[1] === "hard-confirm")
                await admin_service_1.AdminService.hardDeleteProduct(ctx.match[2], actor(ctx), true);
            else
                await admin_service_1.AdminService.deleteProduct(ctx.match[2], actor(ctx));
            await ctx.reply("✅ محصول حذف شد.", (0, main_keyboard_1.navigationKeyboard)("admin:products"));
        }
        catch (error) {
            await ctx.reply(`❌ ${error instanceof Error ? error.message : "حذف ناموفق بود"}`, (0, main_keyboard_1.navigationKeyboard)(`admin:product:${ctx.match[2]}`));
        }
    });
    bot.action(["admin:accounts", /^admin:accounts:page:(\d+)$/, /^admin:accounts:status:(available|reserved|sold|disabled|expired):page:(\d+)$/], async (ctx) => {
        if (!(await requireAdmin(ctx)))
            return;
        await ctx.answerCbQuery();
        const status = "match" in ctx && ctx.match?.[1] && !/^\d+$/.test(ctx.match[1]) ? ctx.match[1] : undefined;
        const page = "match" in ctx && ctx.match ? Number(status ? ctx.match[2] : ctx.match[1]) || 1 : 1;
        const { take, pageSize } = (0, pagination_1.getPagination)(page);
        const [accounts, total] = await admin_service_1.AdminService.listAccounts(page, take, undefined, status);
        const stats = await admin_service_1.AdminService.accountStats();
        const prefix = status ? `admin:accounts:status:${status}` : "admin:accounts";
        const text = `🗄 مدیریت موجودی اکانت‌ها\n📊 ${inventoryStatsLine(stats)}\n${status ? `🔎 فیلتر فعلی: ${statusFa(status)}\n` : ""}\n${accounts.map((account) => `👤 ${account.username} | ${account.product.title} | ${statusFa(account.status)} | کاربر: ${account.assignedUser ? userLabel(account.assignedUser) : "-"} | تاریخ: ${dateFa(account.assignedDate)}`).join("\n") || "اکانتی وجود ندارد."}`;
        await ctx.reply(text, entityListKeyboard(accounts.map((account) => [telegraf_1.Markup.button.callback(`👁 ${account.username}`, `admin:account:${account.id}`)]), prefix, page, total, pageSize, "admin:dashboard", [
            [telegraf_1.Markup.button.callback("➕ افزودن اکانت", "admin:accounts:add"), telegraf_1.Markup.button.callback("📊 آمار موجودی", "admin:inventory:stats")],
            accountStatusFilterKeyboard(status),
            [telegraf_1.Markup.button.callback("نمایش همه", "admin:accounts")],
        ]));
    });
    bot.action("admin:inventory:stats", async (ctx) => {
        if (!(await requireAdmin(ctx)))
            return;
        await ctx.answerCbQuery();
        const stats = await admin_service_1.AdminService.accountStats();
        const productLines = stats.products.map((product) => `• ${product.title} | ${statusFa(product.isActive)} | کل اکانت: ${product._count.accounts.toLocaleString("fa-IR")}`).join("\n") || "محصولی وجود ندارد.";
        await ctx.reply(`📊 آمار کامل موجودی\n${inventoryStatsLine(stats)}\n\n📦 موجودی بر اساس محصول:\n${productLines}`, (0, main_keyboard_1.navigationKeyboard)("admin:accounts"));
    });
    bot.action(/^admin:product:accounts:([^:]+):page:(\d+)$/, async (ctx) => {
        if (!(await requireAdmin(ctx)))
            return;
        await ctx.answerCbQuery();
        const productId = ctx.match[1];
        const page = Number(ctx.match[2]) || 1;
        const { take, pageSize } = (0, pagination_1.getPagination)(page);
        const [accounts, total] = await admin_service_1.AdminService.listAccounts(page, take, undefined, undefined, productId);
        const stats = await admin_service_1.AdminService.accountStats(productId);
        const title = accounts[0]?.product.title ?? (await admin_service_1.AdminService.productDetail(productId)).product?.title ?? "محصول";
        const text = `🗄 اکانت‌های محصول: ${title}\n📊 ${inventoryStatsLine(stats)}\n\n${accounts.map((account) => `👤 ${account.username} | ${statusFa(account.status)} | کاربر: ${account.assignedUser ? userLabel(account.assignedUser) : "-"}`).join("\n") || "اکانتی برای این محصول وجود ندارد."}`;
        await ctx.reply(text, entityListKeyboard(accounts.map((account) => [telegraf_1.Markup.button.callback(`👁 ${account.username}`, `admin:account:${account.id}`)]), `admin:product:accounts:${productId}`, page, total, pageSize, `admin:product:${productId}`, [[telegraf_1.Markup.button.callback("➕ افزودن اکانت", `admin:account:create:${productId}`)]]));
    });
    bot.action("admin:accounts:search", async (ctx) => {
        if (!(await requireAdmin(ctx)))
            return;
        await ctx.answerCbQuery();
        ctx.session.state = { name: "admin_account_search" };
        await ctx.reply("🔎 نام کاربری، لینک یا عنوان محصول را ارسال کنید:", (0, main_keyboard_1.navigationKeyboard)("admin:accounts"));
    });
    bot.action("admin:accounts:add", async (ctx) => {
        if (!(await requireAdmin(ctx)))
            return;
        await ctx.answerCbQuery();
        const products = await product_service_1.ProductService.listActiveProducts(25);
        await ctx.reply("برای کدام محصول اکانت اضافه شود؟", telegraf_1.Markup.inlineKeyboard([...products.map((product) => [telegraf_1.Markup.button.callback(product.title, `admin:account:create:${product.id}`)]), [telegraf_1.Markup.button.callback("⬅️ بازگشت", "admin:accounts")]]));
    });
    bot.action(/^admin:account:create:(.+)$/, async (ctx) => {
        if (!(await requireAdmin(ctx)))
            return;
        await ctx.answerCbQuery();
        (0, admin_flow_1.setFlow)(ctx, { flow: "account_create", step: "username", data: { productId: ctx.match[1] } });
        await ctx.reply("👤 نام کاربری اکانت را ارسال کنید:", (0, main_keyboard_1.navigationKeyboard)("admin:accounts"));
    });
    bot.action(/^admin:account:([^:]+)$/, async (ctx) => {
        if (!(await requireAdmin(ctx)))
            return;
        await ctx.answerCbQuery();
        const account = await admin_service_1.AdminService.accountDetail(ctx.match[1]);
        if (!account)
            return void (await ctx.reply("اکانت پیدا نشد.", (0, main_keyboard_1.navigationKeyboard)("admin:accounts")));
        const history = account.history.map((item) => `• ${dateFa(item.createdAt)} | ${item.action} | ${item.fromValue ?? "-"} → ${item.toValue ?? "-"}`).join("\n") || "بدون تاریخچه";
        await ctx.reply(`🗄 جزئیات اکانت\n\nUsername: ${account.username}\nSubscription: ${account.subscriptionLink}\nConfig: ${account.configLink}\nProduct: ${account.product.title}\nStatus: ${statusFa(account.status)}\nAssigned User: ${account.assignedUser ? userLabel(account.assignedUser) : "-"}\nAssigned Date: ${dateFa(account.assignedDate)}\n\n📜 تاریخچه تخصیص/تغییر:\n${history}`, telegraf_1.Markup.inlineKeyboard([
            [telegraf_1.Markup.button.callback("✏️ ویرایش", `admin:account:edit:${account.id}`), telegraf_1.Markup.button.callback("🚚 انتقال", `admin:account:move:${account.id}`)],
            [telegraf_1.Markup.button.callback(account.status === "disabled" ? "▶️ فعال" : "⏸ غیرفعال", `admin:account:status:${account.id}:${account.status === "disabled" ? "available" : "disabled"}`), telegraf_1.Markup.button.callback("✅ AVAILABLE", `admin:account:status:${account.id}:available`)],
            [telegraf_1.Markup.button.callback("⏳ EXPIRED", `admin:account:status:${account.id}:expired`), telegraf_1.Markup.button.callback("🗑 حذف", `admin:account:delete:${account.id}`)],
            [telegraf_1.Markup.button.callback("⬅️ بازگشت", "admin:accounts")],
        ]));
    });
    bot.action(/^admin:account:edit:(.+)$/, async (ctx) => {
        if (!(await requireAdmin(ctx)))
            return;
        await ctx.answerCbQuery();
        (0, admin_flow_1.setFlow)(ctx, { flow: "account_edit", step: "details", data: { accountId: ctx.match[1] } });
        await ctx.reply(`✏️ ویرایش یا انتقال اکانت\n\n${accountInputHelp()}`, (0, main_keyboard_1.navigationKeyboard)(`admin:account:${ctx.match[1]}`));
    });
    bot.action(/^admin:account:move:(.+)$/, async (ctx) => {
        if (!(await requireAdmin(ctx)))
            return;
        await ctx.answerCbQuery();
        const account = await admin_service_1.AdminService.accountDetail(ctx.match[1]);
        if (!account)
            return void (await ctx.reply("اکانت پیدا نشد.", (0, main_keyboard_1.navigationKeyboard)("admin:accounts")));
        const products = await product_service_1.ProductService.listActiveProducts(50);
        const rows = products
            .filter((product) => product.id !== account.productId)
            .map((product) => [telegraf_1.Markup.button.callback(`${product.title} (${product.category?.name ?? "دسته‌بندی نامعتبر یا حذف‌شده"})`, `admin:account:move-to:${account.id}:${product.id}`)]);
        await ctx.reply(`🚚 انتقال اکانت ${account.username}\nمحصول فعلی: ${account.product.title}\n\nمحصول مقصد را انتخاب کنید:`, telegraf_1.Markup.inlineKeyboard([...rows, [telegraf_1.Markup.button.callback("⬅️ بازگشت", `admin:account:${account.id}`)]]));
    });
    bot.action(/^admin:account:move-to:([^:]+):([^:]+)$/, async (ctx) => {
        if (!(await requireAdmin(ctx)))
            return;
        await ctx.answerCbQuery();
        const account = await admin_service_1.AdminService.moveAccount(ctx.match[1], ctx.match[2], actor(ctx));
        await ctx.reply("✅ اکانت به محصول مقصد منتقل شد.", (0, main_keyboard_1.navigationKeyboard)(`admin:account:${account.id}`));
    });
    bot.action(/^admin:account:status:(.+):(available|reserved|sold|disabled|expired)$/, async (ctx) => {
        if (!(await requireAdmin(ctx)))
            return;
        await ctx.answerCbQuery();
        await admin_service_1.AdminService.setAccountStatus(ctx.match[1], ctx.match[2], actor(ctx));
        await ctx.reply("✅ وضعیت اکانت تغییر کرد.", (0, main_keyboard_1.navigationKeyboard)(`admin:account:${ctx.match[1]}`));
    });
    bot.action(/^admin:account:delete:(.+)$/, async (ctx) => {
        if (!(await requireAdmin(ctx)))
            return;
        await ctx.answerCbQuery();
        await ctx.reply("⚠️ آیا از حذف این مورد مطمئن هستید؟", confirmKeyboard(`admin:account:delete-confirm:${ctx.match[1]}`, `admin:account:${ctx.match[1]}`));
    });
    bot.action(/^admin:account:delete-confirm:(.+)$/, async (ctx) => {
        if (!(await requireAdmin(ctx)))
            return;
        await ctx.answerCbQuery();
        await admin_service_1.AdminService.deleteAccount(ctx.match[1], actor(ctx));
        await ctx.reply("✅ اکانت حذف شد.", (0, main_keyboard_1.navigationKeyboard)("admin:accounts"));
    });
    bot.action(["admin:wallets", /^admin:wallets:page:(\d+)$/], async (ctx) => {
        if (!(await requireAdmin(ctx)))
            return;
        await ctx.answerCbQuery();
        const page = "match" in ctx && ctx.match ? Number(ctx.match[1]) : 1;
        const { take, pageSize } = (0, pagination_1.getPagination)(page);
        const [wallets, total] = await admin_service_1.AdminService.listCryptoWallets(page, take);
        const text = `💳 مدیریت کیف پول‌ها\n📊 تعداد: ${total.toLocaleString("fa-IR")}\n\n${wallets.map((wallet) => `💳 ${wallet.displayName ?? wallet.coinName} | ${wallet.coinSymbol ?? wallet.coinName} | ${wallet.networkName} | ${statusFa(wallet.status)} | ترتیب ${wallet.displayOrder.toLocaleString("fa-IR")}`).join("\n") || "کیف پولی وجود ندارد."}`;
        await ctx.reply(text, entityListKeyboard(wallets.map((wallet) => [telegraf_1.Markup.button.callback(`👁 ${wallet.displayName ?? wallet.coinName}`, `admin:wallet:${wallet.id}`)]), "admin:wallets", page, total, pageSize, "admin:dashboard", [[telegraf_1.Markup.button.callback("➕ افزودن کیف پول", "admin:wallet:create")]]));
    });
    bot.action("admin:wallets:search", async (ctx) => {
        if (!(await requireAdmin(ctx)))
            return;
        await ctx.answerCbQuery();
        ctx.session.state = { name: "admin_wallet_search" };
        await ctx.reply("🔎 نام ارز، نماد، شبکه یا آدرس کیف پول را ارسال کنید:", (0, main_keyboard_1.navigationKeyboard)("admin:wallets"));
    });
    bot.action("admin:wallet:create", async (ctx) => {
        if (!(await requireAdmin(ctx)))
            return;
        await ctx.answerCbQuery();
        (0, admin_flow_1.setFlow)(ctx, { flow: "wallet_create", step: "details", data: {} });
        await ctx.reply(`💳 افزودن کیف پول\n\n${walletInputHelp()}`, (0, main_keyboard_1.navigationKeyboard)("admin:wallets"));
    });
    bot.action(/^admin:wallet:([^:]+)$/, async (ctx) => {
        if (!(await requireAdmin(ctx)))
            return;
        await ctx.answerCbQuery();
        const detail = await admin_service_1.AdminService.walletDetail(ctx.match[1]);
        if (!detail.wallet)
            return void (await ctx.reply("کیف پول پیدا نشد.", (0, main_keyboard_1.navigationKeyboard)("admin:wallets")));
        await ctx.reply(`💳 جزئیات کیف پول\n\nنام ارز: ${detail.wallet.coinName}\nنماد: ${detail.wallet.coinSymbol ?? detail.wallet.coinName}\nشبکه: ${detail.wallet.networkName}\nنام نمایشی: ${detail.wallet.displayName ?? "-"}\nآدرس: ${detail.wallet.walletAddress}\nترتیب: ${detail.wallet.displayOrder.toLocaleString("fa-IR")}\nوضعیت: ${statusFa(detail.wallet.status)}\n\n🛡 ایمنی حذف\nواریزی ساخته‌شده: ${detail.pendingDeposits.toLocaleString("fa-IR")}\nرسید ارسال‌شده: ${detail.submittedDeposits.toLocaleString("fa-IR")}\nپرداخت فعال: ${detail.activePayments.toLocaleString("fa-IR")}\nکل واریزی‌ها: ${detail.deposits.toLocaleString("fa-IR")}`, telegraf_1.Markup.inlineKeyboard([
            [telegraf_1.Markup.button.callback("✏️ ویرایش", `admin:wallet:edit:${detail.wallet.id}`), telegraf_1.Markup.button.callback(detail.wallet.status === "active" ? "⏸ غیرفعال" : "▶️ فعال", `admin:wallet:status:${detail.wallet.id}:${detail.wallet.status === "active" ? "inactive" : "active"}`)],
            [telegraf_1.Markup.button.callback("🗑 حذف", `admin:wallet:delete:${detail.wallet.id}`), telegraf_1.Markup.button.callback("⬅️ بازگشت", "admin:wallets")],
        ]));
    });
    bot.action(/^admin:wallet:edit:(.+)$/, async (ctx) => {
        if (!(await requireAdmin(ctx)))
            return;
        await ctx.answerCbQuery();
        (0, admin_flow_1.setFlow)(ctx, { flow: "wallet_edit", step: "details", data: { walletId: ctx.match[1] } });
        await ctx.reply(`✏️ ویرایش کیف پول\n\n${walletInputHelp()}`, (0, main_keyboard_1.navigationKeyboard)(`admin:wallet:${ctx.match[1]}`));
    });
    bot.action(/^admin:wallet:status:(.+):(active|inactive)$/, async (ctx) => {
        if (!(await requireAdmin(ctx)))
            return;
        await ctx.answerCbQuery();
        await admin_service_1.AdminService.setCryptoWalletStatus(ctx.match[1], ctx.match[2], actor(ctx));
        await ctx.reply("✅ وضعیت کیف پول تغییر کرد.", (0, main_keyboard_1.navigationKeyboard)(`admin:wallet:${ctx.match[1]}`));
    });
    bot.action(/^admin:wallet:delete:(.+)$/, async (ctx) => {
        if (!(await requireAdmin(ctx)))
            return;
        await ctx.answerCbQuery();
        const detail = await admin_service_1.AdminService.walletDetail(ctx.match[1]);
        const warning = detail.activePayments ? `\n\n🛡 این کیف پول ${detail.activePayments.toLocaleString("fa-IR")} پرداخت فعال دارد و تا تعیین وضعیت آن‌ها قابل حذف نیست.` : "";
        await ctx.reply(`⚠️ آیا از حذف این کیف پول مطمئن هستید؟${warning}`, confirmKeyboard(`admin:wallet:delete-confirm:${ctx.match[1]}`, `admin:wallet:${ctx.match[1]}`));
    });
    bot.action(/^admin:wallet:delete-confirm:(.+)$/, async (ctx) => {
        if (!(await requireAdmin(ctx)))
            return;
        await ctx.answerCbQuery();
        try {
            await admin_service_1.AdminService.deleteCryptoWallet(ctx.match[1], actor(ctx));
            await ctx.reply("✅ کیف پول حذف شد.", (0, main_keyboard_1.navigationKeyboard)("admin:wallets"));
        }
        catch (error) {
            await ctx.reply(`❌ ${error instanceof Error ? error.message : "حذف ناموفق بود"}`, (0, main_keyboard_1.navigationKeyboard)(`admin:wallet:${ctx.match[1]}`));
        }
    });
    bot.action("admin:deposits", async (ctx) => {
        if (!(await requireAdmin(ctx)))
            return;
        await ctx.answerCbQuery();
        const [deposits] = await admin_service_1.AdminService.listSubmittedDeposits();
        if (deposits.length === 0)
            return void (await ctx.reply("واریزی در انتظار بررسی وجود ندارد.", (0, main_keyboard_1.navigationKeyboard)("admin:dashboard")));
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
            await (action === "approve" ? deposit_service_1.DepositService.approve(depositId, actor(ctx)) : deposit_service_1.DepositService.reject(depositId, actor(ctx)));
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
        const [coupons] = await admin_service_1.AdminService.listCoupons();
        await ctx.reply(`${coupons.map((coupon) => `🎟 ${coupon.code} | ${coupon.type === "percentage" ? `${coupon.value || coupon.discountPercent || 0}%` : `${coupon.value.toLocaleString("fa-IR")} تومان`} | ${coupon.status} | ${coupon.usedCount}/${coupon.maxUses}`).join("\n") || "کوپنی وجود ندارد."}\n\nبرای ایجاد کوپن جدید دکمه زیر را بزنید.`, telegraf_1.Markup.inlineKeyboard([[telegraf_1.Markup.button.callback("➕ کوپن جدید", "admin:coupon:create")], [telegraf_1.Markup.button.callback("⬅️ بازگشت", "admin:dashboard")]]));
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
        const [tickets] = await admin_service_1.AdminService.listOpenTickets();
        await ctx.reply("تیکت‌های باز:", telegraf_1.Markup.inlineKeyboard([...tickets.map((ticket) => [telegraf_1.Markup.button.callback(`🎧 ${ticket.user.telegramId} - ${ticket.id.slice(-6)}`, `admin:ticket:${ticket.id}`)]), [telegraf_1.Markup.button.callback("⬅️ بازگشت", "admin:dashboard")]]));
    });
    bot.action(/^admin:ticket:([^:]+)$/, async (ctx) => {
        if (!(await requireAdmin(ctx)))
            return;
        await ctx.answerCbQuery();
        const ticket = await support_service_1.SupportService.getTicketWithUser(ctx.match[1]);
        if (!ticket)
            return void (await ctx.reply("تیکت پیدا نشد.", (0, main_keyboard_1.navigationKeyboard)("admin:tickets")));
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
        await support_service_1.SupportService.closeTicket(ctx.match[1], actor(ctx));
        if (ctx.session.liveTicketId === ctx.match[1])
            ctx.session.liveTicketId = undefined;
        await ctx.reply("✅ تیکت بسته شد.", (0, main_keyboard_1.navigationKeyboard)("admin:tickets"));
    });
    bot.action("admin:orders", async (ctx) => {
        if (!(await requireAdmin(ctx)))
            return;
        await ctx.answerCbQuery();
        const [orders] = await admin_service_1.AdminService.listRecentOrders();
        await ctx.reply(orders.map((order) => `🧾 ${order.id.slice(-6)} | ${order.user.telegramId} | ${order.product.title} | ${order.totalAmount.toLocaleString("fa-IR")}`).join("\n") || "سفارشی وجود ندارد.", (0, main_keyboard_1.navigationKeyboard)("admin:dashboard"));
    });
}
