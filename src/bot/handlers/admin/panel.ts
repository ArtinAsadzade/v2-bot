import { Markup } from "telegraf";
import type { InlineKeyboardButton } from "telegraf/types";
import type { AppBot, AppContext } from "../../../types/bot";
import { DepositService } from "../../../modules/deposit/deposit.service";
import { ProductService } from "../../../modules/product/product.service";
import { SupportService } from "../../../modules/support/support.service";
import { AdminService, type ProductAccountAdminStatus } from "../../../modules/admin/admin.service";
import { adminKeyboard } from "../../keyboards/admin.keyboard";
import { navigationKeyboard } from "../../keyboards/main.keyboard";
import { isAdminByTelegramId } from "../../middlewares/admin.middleware";
import { getPagination, getTotalPages } from "../../../utils/pagination";
import { setFlow } from "./admin.flow";

async function requireAdmin(ctx: AppContext): Promise<boolean> {
  if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) {
    await ctx.answerCbQuery?.("دسترسی غیرمجاز").catch(() => undefined);
    return false;
  }
  return true;
}

function actor(ctx: AppContext) {
  return String(ctx.from?.id ?? "system");
}

function statusFa(value: boolean | string | null | undefined) {
  if (typeof value === "boolean") return value ? "فعال" : "غیرفعال";
  return ({ active: "فعال", inactive: "غیرفعال", available: "AVAILABLE", reserved: "RESERVED", sold: "SOLD", disabled: "DISABLED", expired: "EXPIRED" } as Record<string, string>)[String(value)] ?? String(value ?? "-");
}

function dateFa(date?: Date | null) {
  return date ? new Intl.DateTimeFormat("fa-IR", { dateStyle: "short", timeStyle: "short" }).format(date) : "-";
}

function userLabel(user?: { telegramId?: string | null; username?: string | null; firstName?: string | null } | null) {
  if (!user) return "-";
  return [user.firstName, user.username ? `@${user.username}` : undefined, user.telegramId].filter(Boolean).join(" · ");
}

function paginationKeyboard(prefix: string, page: number, totalPages: number, backTo = "admin:dashboard") {
  const rows: InlineKeyboardButton.CallbackButton[][] = [];
  const nav: InlineKeyboardButton.CallbackButton[] = [];
  if (page > 1) nav.push(Markup.button.callback("⬅️ قبلی", `${prefix}:page:${page - 1}`));
  if (page < totalPages) nav.push(Markup.button.callback("بعدی ➡️", `${prefix}:page:${page + 1}`));
  if (nav.length) rows.push(nav);
  rows.push([Markup.button.callback("🔎 جستجو", `${prefix}:search`), Markup.button.callback("↩️ بازگشت", backTo)]);
  return Markup.inlineKeyboard(rows);
}

function confirmKeyboard(confirmAction: string, cancelAction: string) {
  return Markup.inlineKeyboard([[Markup.button.callback("✅ تایید", confirmAction), Markup.button.callback("❌ انصراف", cancelAction)]]);
}

function entityListKeyboard(rows: InlineKeyboardButton.CallbackButton[][], prefix: string, page: number, total: number, pageSize: number, backTo = "admin:dashboard", extra: InlineKeyboardButton.CallbackButton[][] = []) {
  const totalPages = getTotalPages(total, pageSize);
  const nav: InlineKeyboardButton.CallbackButton[] = [];
  if (page > 1) nav.push(Markup.button.callback("⬅️ قبلی", `${prefix}:page:${page - 1}`));
  if (page < totalPages) nav.push(Markup.button.callback("بعدی ➡️", `${prefix}:page:${page + 1}`));
  return Markup.inlineKeyboard([...extra, ...rows, ...(nav.length ? [nav] : []), [Markup.button.callback("🔎 جستجو", `${prefix}:search`), Markup.button.callback("↩️ بازگشت", backTo)]]);
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

function inventoryStatsLine(stats: { total: number; available: number; reserved: number; sold: number; disabled: number; expired: number }) {
  return `کل: ${stats.total.toLocaleString("fa-IR")} | آماده: ${stats.available.toLocaleString("fa-IR")} | رزرو: ${stats.reserved.toLocaleString("fa-IR")} | فروخته: ${stats.sold.toLocaleString("fa-IR")} | غیرفعال: ${stats.disabled.toLocaleString("fa-IR")} | منقضی: ${stats.expired.toLocaleString("fa-IR")}`;
}

function accountStatusFilterKeyboard(currentStatus?: ProductAccountAdminStatus) {
  const statuses: Array<[ProductAccountAdminStatus, string]> = [["available", "✅ آماده"], ["reserved", "⏳ رزرو"], ["sold", "💰 فروخته"], ["disabled", "⏸ غیرفعال"], ["expired", "⌛ منقضی"]];
  return statuses.map(([status, label]) => Markup.button.callback(`${currentStatus === status ? "• " : ""}${label}`, `admin:accounts:status:${status}:page:1`));
}

export function registerAdminHandlers(bot: AppBot) {
  bot.action("admin:dashboard", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();
    const stats = await AdminService.dashboard();
    await ctx.reply(
      `👨‍💼 پنل مدیریت\n\n👥 کاربران: ${stats.users.toLocaleString("fa-IR")}\n📂 دسته‌بندی‌ها: ${stats.categories.toLocaleString("fa-IR")}\n📦 محصولات: ${stats.products.toLocaleString("fa-IR")}\n🗄 موجودی کل: ${stats.totalAccounts.toLocaleString("fa-IR")}\n✅ آماده: ${stats.availableAccounts.toLocaleString("fa-IR")} | ⏳ رزرو: ${stats.reservedAccounts.toLocaleString("fa-IR")} | 💰 فروخته: ${stats.soldAccounts.toLocaleString("fa-IR")} | ⏸ غیرفعال: ${stats.disabledAccounts.toLocaleString("fa-IR")} | ⌛ منقضی: ${stats.expiredAccounts.toLocaleString("fa-IR")}\n💳 کیف پول‌ها: ${stats.wallets.toLocaleString("fa-IR")}\n💳 واریزی‌های در انتظار: ${stats.submittedDeposits.toLocaleString("fa-IR")}\n🎧 تیکت‌های باز: ${stats.openTickets.toLocaleString("fa-IR")}\n🧾 سفارش‌ها: ${stats.orders.toLocaleString("fa-IR")}\n💰 درآمد: ${stats.revenue.toLocaleString("fa-IR")} تومان`,
      adminKeyboard(),
    );
  });

  bot.action(["admin:users", /^admin:users:page:(\d+)$/], async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();
    const page = "match" in ctx && ctx.match ? Number(ctx.match[1]) : 1;
    const { take, pageSize } = getPagination(page);
    const [users, total] = await AdminService.listUsers(page, take);
    await ctx.reply(users.map((user) => `👤 ${user.telegramId} @${user.username ?? "-"} | ${user.balance.toLocaleString("fa-IR")} تومان`).join("\n") || "کاربری وجود ندارد.", paginationKeyboard("admin:users", page, getTotalPages(total, pageSize)));
  });

  bot.action("admin:users:search", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();
    ctx.session.state = { name: "admin_user_search" };
    await ctx.reply("🔎 شناسه تلگرام، نام کاربری یا نام کاربر را ارسال کنید:", navigationKeyboard("admin:users"));
  });

  bot.action(["admin:categories", /^admin:categories:page:(\d+)$/], async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();
    const page = "match" in ctx && ctx.match ? Number(ctx.match[1]) : 1;
    const { take, pageSize } = getPagination(page);
    const [categories, total] = await AdminService.listCategories(page, take);
    const text = `📂 مدیریت دسته‌بندی‌ها\n📊 تعداد: ${total.toLocaleString("fa-IR")}\n\n${categories.map((category) => `${category.icon ?? "📂"} ${category.name} | ${statusFa(category.isActive)} | ترتیب ${category.displayOrder.toLocaleString("fa-IR")} | محصول ${category._count.products.toLocaleString("fa-IR")} | فعال ${category.activeProductCount.toLocaleString("fa-IR")}`).join("\n") || "دسته‌بندی وجود ندارد."}`;
    await ctx.reply(text, entityListKeyboard(categories.map((category) => [Markup.button.callback(`👁 ${category.name}`, `admin:category:${category.id}`)]), "admin:categories", page, total, pageSize, "admin:dashboard", [[Markup.button.callback("➕ ایجاد دسته‌بندی", "admin:category:create")]]));
  });

  bot.action("admin:categories:search", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();
    ctx.session.state = { name: "admin_category_search" };
    await ctx.reply("🔎 عنوان یا توضیح دسته‌بندی را ارسال کنید:", navigationKeyboard("admin:categories"));
  });

  bot.action("admin:category:create", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();
    setFlow(ctx, { flow: "category_create", step: "details", data: {} });
    await ctx.reply(`📂 ایجاد دسته‌بندی\n\n${categoryInputHelp()}`, navigationKeyboard("admin:categories"));
  });

  bot.action([/^admin:category:([^:]+)$/, /^admin:category:products:([^:]+):page:(\d+)$/], async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();
    const categoryId = ctx.match[1];
    const productPage = ctx.match[2] ? Number(ctx.match[2]) : 1;
    const detail = await AdminService.categoryDetail(categoryId, productPage, 8);
    if (!detail.category) return void (await ctx.reply("دسته‌بندی پیدا نشد.", navigationKeyboard("admin:categories")));
    const productTotalPages = getTotalPages(detail.productCount, detail.productTake);
    const products = detail.products.map((product) => `• ${product.title} | ${statusFa(product.isActive)} | فروش ${product._count.orders.toLocaleString("fa-IR")}`).join("\n") || "بدون محصول";
    const productNav: InlineKeyboardButton.CallbackButton[] = [];
    if (productPage > 1) productNav.push(Markup.button.callback("⬅️ محصولات قبلی", `admin:category:products:${detail.category.id}:page:${productPage - 1}`));
    if (productPage < productTotalPages) productNav.push(Markup.button.callback("محصولات بعدی ➡️", `admin:category:products:${detail.category.id}:page:${productPage + 1}`));
    await ctx.reply(
      `${detail.category.icon ?? "📂"} ${detail.category.name}\nتوضیحات: ${detail.category.description ?? "-"}\nترتیب نمایش: ${detail.category.displayOrder.toLocaleString("fa-IR")}\nوضعیت: ${statusFa(detail.category.isActive)}\n\n📊 آمار فروشگاه\nمحصولات: ${detail.productCount.toLocaleString("fa-IR")}\nمحصولات فعال: ${detail.activeProductCount.toLocaleString("fa-IR")}\nتعداد فروش: ${detail.salesCount.toLocaleString("fa-IR")}\n\n📦 محصولات داخل دسته (صفحه ${productPage.toLocaleString("fa-IR")} از ${productTotalPages.toLocaleString("fa-IR")}):\n${products}`,
      Markup.inlineKeyboard([
        ...(productNav.length ? [productNav] : []),
        [Markup.button.callback("✏️ ویرایش", `admin:category:edit:${detail.category.id}`), Markup.button.callback(detail.category.isActive ? "⏸ غیرفعال" : "▶️ فعال", `admin:category:status:${detail.category.id}:${detail.category.isActive ? "off" : "on"}`)],
        [Markup.button.callback("🗑 حذف نرم", `admin:category:delete:${detail.category.id}`), Markup.button.callback("🔥 حذف دائمی", `admin:category:hard:${detail.category.id}`)],
        [Markup.button.callback("⬅️ بازگشت", "admin:categories")],
      ]),
    );
  });

  bot.action(/^admin:category:edit:(.+)$/, async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();
    setFlow(ctx, { flow: "category_edit", step: "details", data: { categoryId: ctx.match[1] } });
    await ctx.reply(`✏️ ویرایش دسته‌بندی\n\n${categoryInputHelp()}`, navigationKeyboard(`admin:category:${ctx.match[1]}`));
  });

  bot.action(/^admin:category:status:(.+):(on|off)$/, async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();
    await AdminService.setCategoryActive(ctx.match[1], ctx.match[2] === "on", actor(ctx));
    await ctx.reply("✅ وضعیت دسته‌بندی تغییر کرد.", navigationKeyboard(`admin:category:${ctx.match[1]}`));
  });

  bot.action(/^admin:category:(delete|hard):(.+)$/, async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();
    const hard = ctx.match[1] === "hard";
    await ctx.reply("⚠️ آیا از حذف این مورد مطمئن هستید؟", confirmKeyboard(`admin:category:${hard ? "hard-confirm" : "delete-confirm"}:${ctx.match[2]}`, `admin:category:${ctx.match[2]}`));
  });

  bot.action(/^admin:category:(delete-confirm|hard-confirm):(.+)$/, async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();
    try {
      if (ctx.match[1] === "hard-confirm") await AdminService.hardDeleteCategory(ctx.match[2], actor(ctx), true);
      else await AdminService.deleteCategory(ctx.match[2], actor(ctx));
      await ctx.reply("✅ دسته‌بندی حذف شد.", navigationKeyboard("admin:categories"));
    } catch (error) {
      await ctx.reply(`❌ ${error instanceof Error ? error.message : "حذف ناموفق بود"}`, navigationKeyboard(`admin:category:${ctx.match[2]}`));
    }
  });

  bot.action(["admin:products", /^admin:products:page:(\d+)$/], async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();
    const page = "match" in ctx && ctx.match ? Number(ctx.match[1]) : 1;
    const { take, pageSize } = getPagination(page);
    const [products, total] = await AdminService.listProducts(page, take);
    const text = `📦 مدیریت محصولات\n📊 تعداد: ${total.toLocaleString("fa-IR")}\n\n${products.map((product) => `📦 ${product.title} | ${product.category?.name ?? "دسته‌بندی نامعتبر یا حذف‌شده"} | ${product.price.toLocaleString("fa-IR")} تومان | ${product.duration} روز | موجودی ${product.inventoryCount.toLocaleString("fa-IR")} | فروخته ${product.soldCount.toLocaleString("fa-IR")} | فعال ${product.activeCount.toLocaleString("fa-IR")} | ${statusFa(product.isActive)}`).join("\n") || "محصولی وجود ندارد."}`;
    await ctx.reply(text, entityListKeyboard(products.map((product) => [Markup.button.callback(`👁 ${product.title}`, `admin:product:${product.id}`)]), "admin:products", page, total, pageSize, "admin:dashboard", [[Markup.button.callback("➕ ایجاد محصول", "admin:product:create")]]));
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
    await ctx.reply("📦 نام محصول را ارسال کنید:", navigationKeyboard("admin:products"));
  });

  bot.action(/^admin:product:([^:]+)$/, async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();
    const detail = await AdminService.productDetail(ctx.match[1]);
    if (!detail.product) return void (await ctx.reply("محصول پیدا نشد.", navigationKeyboard("admin:products")));
    await ctx.reply(
      `📦 اطلاعات محصول\n\nنام: ${detail.product.title}\nدسته‌بندی: ${detail.product.category?.name ?? "دسته‌بندی نامعتبر یا حذف‌شده"}\nقیمت: ${detail.product.price.toLocaleString("fa-IR")} تومان\nمدت: ${detail.product.duration} روز\nوضعیت: ${statusFa(detail.product.isActive)}\nتاریخ ایجاد: ${dateFa(detail.product.createdAt)}\n\n📊 آمار موجودی\nکل: ${detail.product._count.accounts.toLocaleString("fa-IR")}\nآماده: ${detail.available.toLocaleString("fa-IR")}\nرزرو: ${detail.reserved.toLocaleString("fa-IR")}\nفروخته‌شده: ${detail.sold.toLocaleString("fa-IR")}\nغیرفعال: ${detail.disabled.toLocaleString("fa-IR")}\nمنقضی: ${detail.expired.toLocaleString("fa-IR")}\nسفارش موفق: ${detail.orderCount.toLocaleString("fa-IR")}\nدرآمد: ${detail.revenue.toLocaleString("fa-IR")} تومان`,
      Markup.inlineKeyboard([
        [Markup.button.callback("✏️ ویرایش", `admin:product:edit:${detail.product.id}`), Markup.button.callback(detail.product.isActive ? "⏸ غیرفعال" : "▶️ فعال", `admin:product:status:${detail.product.id}:${detail.product.isActive ? "off" : "on"}`)],
        [Markup.button.callback("🗄 اکانت‌های محصول", `admin:product:accounts:${detail.product.id}:page:1`), Markup.button.callback("➕ افزودن اکانت", `admin:account:create:${detail.product.id}`)],
        [Markup.button.callback("📋 کپی محصول", `admin:product:duplicate:${detail.product.id}`)],
        [Markup.button.callback("🗑 حذف نرم", `admin:product:delete:${detail.product.id}`), Markup.button.callback("🔥 حذف دائمی", `admin:product:hard:${detail.product.id}`)],
        [Markup.button.callback("⬅️ بازگشت", "admin:products")],
      ]),
    );
  });

  bot.action(/^admin:product:edit:(.+)$/, async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();
    setFlow(ctx, { flow: "product_edit", step: "details", data: { productId: ctx.match[1] } });
    await ctx.reply(`✏️ ویرایش محصول\n\n${productInputHelp()}`, navigationKeyboard(`admin:product:${ctx.match[1]}`));
  });

  bot.action(/^admin:product:status:(.+):(on|off)$/, async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();
    await AdminService.setProductActive(ctx.match[1], ctx.match[2] === "on", actor(ctx));
    await ctx.reply("✅ وضعیت محصول تغییر کرد.", navigationKeyboard(`admin:product:${ctx.match[1]}`));
  });

  bot.action(/^admin:product:duplicate:(.+)$/, async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();
    const product = await AdminService.duplicateProduct(ctx.match[1], actor(ctx));
    await ctx.reply(`✅ محصول کپی شد: ${product.title}`, navigationKeyboard(`admin:product:${product.id}`));
  });

  bot.action(/^admin:product:(delete|hard):(.+)$/, async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();
    await ctx.reply("⚠️ آیا از حذف این مورد مطمئن هستید؟", confirmKeyboard(`admin:product:${ctx.match[1]}-confirm:${ctx.match[2]}`, `admin:product:${ctx.match[2]}`));
  });

  bot.action(/^admin:product:(delete-confirm|hard-confirm):(.+)$/, async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();
    try {
      if (ctx.match[1] === "hard-confirm") await AdminService.hardDeleteProduct(ctx.match[2], actor(ctx), true);
      else await AdminService.deleteProduct(ctx.match[2], actor(ctx));
      await ctx.reply("✅ محصول حذف شد.", navigationKeyboard("admin:products"));
    } catch (error) {
      await ctx.reply(`❌ ${error instanceof Error ? error.message : "حذف ناموفق بود"}`, navigationKeyboard(`admin:product:${ctx.match[2]}`));
    }
  });

  bot.action(["admin:accounts", /^admin:accounts:page:(\d+)$/, /^admin:accounts:status:(available|reserved|sold|disabled|expired):page:(\d+)$/], async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();
    const status = "match" in ctx && ctx.match?.[1] && !/^\d+$/.test(ctx.match[1]) ? ctx.match[1] as ProductAccountAdminStatus : undefined;
    const page = "match" in ctx && ctx.match ? Number(status ? ctx.match[2] : ctx.match[1]) || 1 : 1;
    const { take, pageSize } = getPagination(page);
    const [accounts, total] = await AdminService.listAccounts(page, take, undefined, status);
    const stats = await AdminService.accountStats();
    const prefix = status ? `admin:accounts:status:${status}` : "admin:accounts";
    const text = `🗄 مدیریت موجودی اکانت‌ها\n📊 ${inventoryStatsLine(stats)}\n${status ? `🔎 فیلتر فعلی: ${statusFa(status)}\n` : ""}\n${accounts.map((account) => `👤 ${account.username} | ${account.product.title} | ${statusFa(account.status)} | کاربر: ${account.assignedUser ? userLabel(account.assignedUser) : "-"} | تاریخ: ${dateFa(account.assignedDate)}`).join("\n") || "اکانتی وجود ندارد."}`;
    await ctx.reply(
      text,
      entityListKeyboard(
        accounts.map((account) => [Markup.button.callback(`👁 ${account.username}`, `admin:account:${account.id}`)]),
        prefix,
        page,
        total,
        pageSize,
        "admin:dashboard",
        [
          [Markup.button.callback("➕ افزودن اکانت", "admin:accounts:add"), Markup.button.callback("📊 آمار موجودی", "admin:inventory:stats")],
          accountStatusFilterKeyboard(status),
          [Markup.button.callback("نمایش همه", "admin:accounts")],
        ],
      ),
    );
  });

  bot.action("admin:inventory:stats", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();
    const stats = await AdminService.accountStats();
    const productLines = stats.products.map((product) => `• ${product.title} | ${statusFa(product.isActive)} | کل اکانت: ${product._count.accounts.toLocaleString("fa-IR")}`).join("\n") || "محصولی وجود ندارد.";
    await ctx.reply(`📊 آمار کامل موجودی\n${inventoryStatsLine(stats)}\n\n📦 موجودی بر اساس محصول:\n${productLines}`, navigationKeyboard("admin:accounts"));
  });

  bot.action(/^admin:product:accounts:([^:]+):page:(\d+)$/, async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();
    const productId = ctx.match[1];
    const page = Number(ctx.match[2]) || 1;
    const { take, pageSize } = getPagination(page);
    const [accounts, total] = await AdminService.listAccounts(page, take, undefined, undefined, productId);
    const stats = await AdminService.accountStats(productId);
    const title = accounts[0]?.product.title ?? (await AdminService.productDetail(productId)).product?.title ?? "محصول";
    const text = `🗄 اکانت‌های محصول: ${title}\n📊 ${inventoryStatsLine(stats)}\n\n${accounts.map((account) => `👤 ${account.username} | ${statusFa(account.status)} | کاربر: ${account.assignedUser ? userLabel(account.assignedUser) : "-"}`).join("\n") || "اکانتی برای این محصول وجود ندارد."}`;
    await ctx.reply(text, entityListKeyboard(accounts.map((account) => [Markup.button.callback(`👁 ${account.username}`, `admin:account:${account.id}`)]), `admin:product:accounts:${productId}`, page, total, pageSize, `admin:product:${productId}`, [[Markup.button.callback("➕ افزودن اکانت", `admin:account:create:${productId}`)]]));
  });

  bot.action("admin:accounts:search", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();
    ctx.session.state = { name: "admin_account_search" };
    await ctx.reply("🔎 نام کاربری، لینک یا عنوان محصول را ارسال کنید:", navigationKeyboard("admin:accounts"));
  });

  bot.action("admin:accounts:add", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();
    const products = await ProductService.listActiveProducts(25);
    await ctx.reply("برای کدام محصول اکانت اضافه شود؟", Markup.inlineKeyboard([...products.map((product) => [Markup.button.callback(product.title, `admin:account:create:${product.id}`)]), [Markup.button.callback("⬅️ بازگشت", "admin:accounts")]]));
  });

  bot.action(/^admin:account:create:(.+)$/, async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();
    setFlow(ctx, { flow: "account_create", step: "username", data: { productId: ctx.match[1] } });
    await ctx.reply("👤 نام کاربری اکانت را ارسال کنید:", navigationKeyboard("admin:accounts"));
  });

  bot.action(/^admin:account:([^:]+)$/, async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();
    const account = await AdminService.accountDetail(ctx.match[1]);
    if (!account) return void (await ctx.reply("اکانت پیدا نشد.", navigationKeyboard("admin:accounts")));
    const history = account.history.map((item) => `• ${dateFa(item.createdAt)} | ${item.action} | ${item.fromValue ?? "-"} → ${item.toValue ?? "-"}`).join("\n") || "بدون تاریخچه";
    await ctx.reply(
      `🗄 جزئیات اکانت\n\nUsername: ${account.username}\nSubscription: ${account.subscriptionLink}\nConfig: ${account.configLink}\nProduct: ${account.product.title}\nStatus: ${statusFa(account.status)}\nAssigned User: ${account.assignedUser ? userLabel(account.assignedUser) : "-"}\nAssigned Date: ${dateFa(account.assignedDate)}\n\n📜 تاریخچه تخصیص/تغییر:\n${history}`,
      Markup.inlineKeyboard([
        [Markup.button.callback("✏️ ویرایش", `admin:account:edit:${account.id}`), Markup.button.callback("🚚 انتقال", `admin:account:move:${account.id}`)],
        [Markup.button.callback(account.status === "disabled" ? "▶️ فعال" : "⏸ غیرفعال", `admin:account:status:${account.id}:${account.status === "disabled" ? "available" : "disabled"}`), Markup.button.callback("✅ AVAILABLE", `admin:account:status:${account.id}:available`)],
        [Markup.button.callback("⏳ EXPIRED", `admin:account:status:${account.id}:expired`), Markup.button.callback("🗑 حذف", `admin:account:delete:${account.id}`)],
        [Markup.button.callback("⬅️ بازگشت", "admin:accounts")],
      ]),
    );
  });

  bot.action(/^admin:account:edit:(.+)$/, async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();
    setFlow(ctx, { flow: "account_edit", step: "details", data: { accountId: ctx.match[1] } });
    await ctx.reply(`✏️ ویرایش یا انتقال اکانت\n\n${accountInputHelp()}`, navigationKeyboard(`admin:account:${ctx.match[1]}`));
  });

  bot.action(/^admin:account:move:(.+)$/, async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();
    const account = await AdminService.accountDetail(ctx.match[1]);
    if (!account) return void (await ctx.reply("اکانت پیدا نشد.", navigationKeyboard("admin:accounts")));
    const products = await ProductService.listActiveProducts(50);
    const rows = products
      .filter((product) => product.id !== account.productId)
      .map((product) => [Markup.button.callback(`${product.title} (${product.category?.name ?? "دسته‌بندی نامعتبر یا حذف‌شده"})`, `admin:account:move-to:${account.id}:${product.id}`)]);
    await ctx.reply(`🚚 انتقال اکانت ${account.username}\nمحصول فعلی: ${account.product.title}\n\nمحصول مقصد را انتخاب کنید:`, Markup.inlineKeyboard([...rows, [Markup.button.callback("⬅️ بازگشت", `admin:account:${account.id}`)]]));
  });

  bot.action(/^admin:account:move-to:([^:]+):([^:]+)$/, async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();
    const account = await AdminService.moveAccount(ctx.match[1], ctx.match[2], actor(ctx));
    await ctx.reply("✅ اکانت به محصول مقصد منتقل شد.", navigationKeyboard(`admin:account:${account.id}`));
  });

  bot.action(/^admin:account:status:(.+):(available|reserved|sold|disabled|expired)$/, async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();
    await AdminService.setAccountStatus(ctx.match[1], ctx.match[2] as ProductAccountAdminStatus, actor(ctx));
    await ctx.reply("✅ وضعیت اکانت تغییر کرد.", navigationKeyboard(`admin:account:${ctx.match[1]}`));
  });

  bot.action(/^admin:account:delete:(.+)$/, async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();
    await ctx.reply("⚠️ آیا از حذف این مورد مطمئن هستید؟", confirmKeyboard(`admin:account:delete-confirm:${ctx.match[1]}`, `admin:account:${ctx.match[1]}`));
  });

  bot.action(/^admin:account:delete-confirm:(.+)$/, async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();
    await AdminService.deleteAccount(ctx.match[1], actor(ctx));
    await ctx.reply("✅ اکانت حذف شد.", navigationKeyboard("admin:accounts"));
  });

  bot.action(["admin:wallets", /^admin:wallets:page:(\d+)$/], async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();
    const page = "match" in ctx && ctx.match ? Number(ctx.match[1]) : 1;
    const { take, pageSize } = getPagination(page);
    const [wallets, total] = await AdminService.listCryptoWallets(page, take);
    const text = `💳 مدیریت کیف پول‌ها\n📊 تعداد: ${total.toLocaleString("fa-IR")}\n\n${wallets.map((wallet) => `💳 ${wallet.displayName ?? wallet.coinName} | ${wallet.coinSymbol ?? wallet.coinName} | ${wallet.networkName} | ${statusFa(wallet.status)} | ترتیب ${wallet.displayOrder.toLocaleString("fa-IR")}`).join("\n") || "کیف پولی وجود ندارد."}`;
    await ctx.reply(text, entityListKeyboard(wallets.map((wallet) => [Markup.button.callback(`👁 ${wallet.displayName ?? wallet.coinName}`, `admin:wallet:${wallet.id}`)]), "admin:wallets", page, total, pageSize, "admin:dashboard", [[Markup.button.callback("➕ افزودن کیف پول", "admin:wallet:create")]]));
  });

  bot.action("admin:wallets:search", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();
    ctx.session.state = { name: "admin_wallet_search" };
    await ctx.reply("🔎 نام ارز، نماد، شبکه یا آدرس کیف پول را ارسال کنید:", navigationKeyboard("admin:wallets"));
  });

  bot.action("admin:wallet:create", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();
    setFlow(ctx, { flow: "wallet_create", step: "details", data: {} });
    await ctx.reply(`💳 افزودن کیف پول\n\n${walletInputHelp()}`, navigationKeyboard("admin:wallets"));
  });

  bot.action(/^admin:wallet:([^:]+)$/, async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();
    const detail = await AdminService.walletDetail(ctx.match[1]);
    if (!detail.wallet) return void (await ctx.reply("کیف پول پیدا نشد.", navigationKeyboard("admin:wallets")));
    await ctx.reply(
      `💳 جزئیات کیف پول\n\nنام ارز: ${detail.wallet.coinName}\nنماد: ${detail.wallet.coinSymbol ?? detail.wallet.coinName}\nشبکه: ${detail.wallet.networkName}\nنام نمایشی: ${detail.wallet.displayName ?? "-"}\nآدرس: ${detail.wallet.walletAddress}\nترتیب: ${detail.wallet.displayOrder.toLocaleString("fa-IR")}\nوضعیت: ${statusFa(detail.wallet.status)}\n\n🛡 ایمنی حذف\nواریزی ساخته‌شده: ${detail.pendingDeposits.toLocaleString("fa-IR")}\nرسید ارسال‌شده: ${detail.submittedDeposits.toLocaleString("fa-IR")}\nپرداخت فعال: ${detail.activePayments.toLocaleString("fa-IR")}\nکل واریزی‌ها: ${detail.deposits.toLocaleString("fa-IR")}`,
      Markup.inlineKeyboard([
        [Markup.button.callback("✏️ ویرایش", `admin:wallet:edit:${detail.wallet.id}`), Markup.button.callback(detail.wallet.status === "active" ? "⏸ غیرفعال" : "▶️ فعال", `admin:wallet:status:${detail.wallet.id}:${detail.wallet.status === "active" ? "inactive" : "active"}`)],
        [Markup.button.callback("🗑 حذف", `admin:wallet:delete:${detail.wallet.id}`), Markup.button.callback("⬅️ بازگشت", "admin:wallets")],
      ]),
    );
  });

  bot.action(/^admin:wallet:edit:(.+)$/, async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();
    setFlow(ctx, { flow: "wallet_edit", step: "details", data: { walletId: ctx.match[1] } });
    await ctx.reply(`✏️ ویرایش کیف پول\n\n${walletInputHelp()}`, navigationKeyboard(`admin:wallet:${ctx.match[1]}`));
  });

  bot.action(/^admin:wallet:status:(.+):(active|inactive)$/, async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();
    await AdminService.setCryptoWalletStatus(ctx.match[1], ctx.match[2] as "active" | "inactive", actor(ctx));
    await ctx.reply("✅ وضعیت کیف پول تغییر کرد.", navigationKeyboard(`admin:wallet:${ctx.match[1]}`));
  });

  bot.action(/^admin:wallet:delete:(.+)$/, async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();
    const detail = await AdminService.walletDetail(ctx.match[1]);
    const warning = detail.activePayments ? `\n\n🛡 این کیف پول ${detail.activePayments.toLocaleString("fa-IR")} پرداخت فعال دارد و تا تعیین وضعیت آن‌ها قابل حذف نیست.` : "";
    await ctx.reply(`⚠️ آیا از حذف این کیف پول مطمئن هستید؟${warning}`, confirmKeyboard(`admin:wallet:delete-confirm:${ctx.match[1]}`, `admin:wallet:${ctx.match[1]}`));
  });

  bot.action(/^admin:wallet:delete-confirm:(.+)$/, async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();
    try {
      await AdminService.deleteCryptoWallet(ctx.match[1], actor(ctx));
      await ctx.reply("✅ کیف پول حذف شد.", navigationKeyboard("admin:wallets"));
    } catch (error) {
      await ctx.reply(`❌ ${error instanceof Error ? error.message : "حذف ناموفق بود"}`, navigationKeyboard(`admin:wallet:${ctx.match[1]}`));
    }
  });

  bot.action("admin:deposits", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();
    const [deposits] = await AdminService.listSubmittedDeposits();
    if (deposits.length === 0) return void (await ctx.reply("واریزی در انتظار بررسی وجود ندارد.", navigationKeyboard("admin:dashboard")));
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
      await (action === "approve" ? DepositService.approve(depositId, actor(ctx)) : DepositService.reject(depositId, actor(ctx)));
      AdminService.invalidateDashboardCache();
      await ctx.reply(action === "approve" ? "✅ واریزی تایید و کیف پول شارژ شد." : "❌ واریزی رد شد.", navigationKeyboard("admin:deposits"));
    } catch (error) {
      await ctx.reply(`❌ ${error instanceof Error ? error.message : "عملیات ناموفق بود"}`, navigationKeyboard("admin:deposits"));
    }
  });

  bot.action("admin:coupons", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();
    const [coupons] = await AdminService.listCoupons();
    await ctx.reply(`${coupons.map((coupon) => `🎟 ${coupon.code} | ${coupon.type === "percentage" ? `${coupon.value || coupon.discountPercent || 0}%` : `${coupon.value.toLocaleString("fa-IR")} تومان`} | ${coupon.status} | ${coupon.usedCount}/${coupon.maxUses}`).join("\n") || "کوپنی وجود ندارد."}\n\nبرای ایجاد کوپن جدید دکمه زیر را بزنید.`, Markup.inlineKeyboard([[Markup.button.callback("➕ کوپن جدید", "admin:coupon:create")], [Markup.button.callback("⬅️ بازگشت", "admin:dashboard")]]));
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
    const [tickets] = await AdminService.listOpenTickets();
    await ctx.reply("تیکت‌های باز:", Markup.inlineKeyboard([...tickets.map((ticket) => [Markup.button.callback(`🎧 ${ticket.user.telegramId} - ${ticket.id.slice(-6)}`, `admin:ticket:${ticket.id}`)]), [Markup.button.callback("⬅️ بازگشت", "admin:dashboard")]]));
  });

  bot.action(/^admin:ticket:([^:]+)$/, async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();
    const ticket = await SupportService.getTicketWithUser(ctx.match[1]);
    if (!ticket) return void (await ctx.reply("تیکت پیدا نشد.", navigationKeyboard("admin:tickets")));
    ctx.session.liveTicketId = ticket.id;
    const history = ticket.messages.map((message) => `${message.senderRole === "admin" ? "ادمین" : "کاربر"}: ${message.message}`).join("\n") || "بدون پیام";
    await ctx.reply(`🎧 تیکت ${ticket.id}\nکاربر: ${ticket.user.telegramId}\n\n${history}\n\n💬 حالت گفتگوی زنده فعال شد. هر پیام شما مستقیم داخل همین تیکت ارسال می‌شود.`, Markup.inlineKeyboard([[Markup.button.callback("✅ بستن تیکت", `admin:ticket:close:${ticket.id}`)], [Markup.button.callback("🚪 خروج از چت", "admin:ticket:leave"), Markup.button.callback("⬅️ بازگشت", "admin:tickets")]]));
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
    await SupportService.closeTicket(ctx.match[1], actor(ctx));
    if (ctx.session.liveTicketId === ctx.match[1]) ctx.session.liveTicketId = undefined;
    await ctx.reply("✅ تیکت بسته شد.", navigationKeyboard("admin:tickets"));
  });

  bot.action("admin:orders", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();
    const [orders] = await AdminService.listRecentOrders();
    await ctx.reply(orders.map((order) => `🧾 ${order.id.slice(-6)} | ${order.user.telegramId} | ${order.product.title} | ${order.totalAmount.toLocaleString("fa-IR")}`).join("\n") || "سفارشی وجود ندارد.", navigationKeyboard("admin:dashboard"));
  });
}
