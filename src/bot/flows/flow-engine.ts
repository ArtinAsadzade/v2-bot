import type { AppBot, AppContext, FlowName } from "../../types/bot";
import { renderPanel, callbackFor, panelKeyboard, type UiKeyboard, type ViewState } from "../navigation/panel-ui";
import { UserService } from "../../modules/user/user.service";
import { ProductService } from "../../modules/product/product.service";
import { CouponService } from "../../modules/coupon/coupon.service";
import { CryptoWalletService, DepositService, FinancialSettingsService } from "../../modules/deposit/deposit.service";
import { SupportService } from "../../modules/support/support.service";
import { AdminService, type ProductAccountAdminStatus } from "../../modules/admin/admin.service";
import { FreeAccountService } from "../../modules/free-account/free-account.service";
import { ReferralService } from "../../modules/referral/referral.service";
import { BroadcastService } from "../../modules/broadcast/broadcast.service";
import { isAdminByTelegramId } from "../middlewares/admin.middleware";

const money = (value: number) => `${value.toLocaleString("fa-IR")} تومان`;
const parseInteger = (value: string) => Number(value.replace(/[,،\s]/g, ""));
const parseStatus = (value?: string) => {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === "active" || normalized === "فعال") return "active" as const;
  if (normalized === "inactive" || normalized.includes("غیر")) return "inactive" as const;
  return undefined;
};
const parseCouponType = (value?: string) => {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === "fixed" || normalized.includes("ثابت")) return "fixed" as const;
  if (normalized === "percentage" || normalized.includes("درصد")) return "percentage" as const;
  return undefined;
};


function parseKeyValueLines(text: string): Record<string, string> {
  return Object.fromEntries(
    text
      .split(/\n+/)
      .map((line) => line.split(/[:=：]/, 2).map((part) => part.trim()))
      .filter((parts): parts is [string, string] => parts.length === 2 && Boolean(parts[0]) && Boolean(parts[1])),
  );
}

function parseActive(value?: string): boolean | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "active", "فعال", "بله", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "inactive", "غیرفعال", "خیر", "no", "off"].includes(normalized) || normalized.includes("غیر")) return false;
  return undefined;
}

function parseProductAccountStatus(value?: string): ProductAccountAdminStatus | undefined {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return undefined;
  return ["available", "reserved", "sold", "disabled", "expired"].includes(normalized) ? normalized as ProductAccountAdminStatus : undefined;
}


type FlowStepResult = { done?: boolean; text: string; nextStep?: string; returnTo?: ViewState; keyboard?: UiKeyboard };
type FlowDefinition = {
  firstStep: string;
  prompt: ((ctx: AppContext) => Promise<string> | string) | string;
  handleText?: (ctx: AppContext, text: string) => Promise<FlowStepResult>;
  handlePhoto?: (ctx: AppContext, fileId: string) => Promise<FlowStepResult>;
};

function currentReturnTo(ctx: AppContext): ViewState {
  const stack = ctx.session.navigation?.stack ?? [];
  return stack[stack.length - 1] ?? { id: "home" };
}

async function flowPrompt(ctx: AppContext, text: string, keyboard: UiKeyboard = []) {
  await ctx.reply(text, { ...panelKeyboard(keyboard, { back: false, home: true, cancel: true }) });
}

function requireUser(ctx: AppContext) {
  if (!ctx.from) throw new Error("کاربر پیدا نشد");
  return UserService.getByTelegramId(ctx.from.id).then((user) => {
    if (!user) throw new Error("کاربر پیدا نشد");
    return user;
  });
}

async function completeBroadcast(ctx: AppContext) {
  const flow = ctx.session.flow;
  const target = String(flow?.data.target ?? "");
  const message = String(flow?.data.message ?? "").trim();
  if (!BroadcastService.isTarget(target)) return "⚠️ گروه دریافت‌کنندگان معتبر نیست.";
  const stats = await BroadcastService.send(target, message, String(ctx.from?.id ?? "admin"), (telegramId, text) => ctx.telegram.sendMessage(Number(telegramId), text));
  return `✅ اطلاع‌رسانی پایان یافت

گروه: ${stats.targetLabel}
ارسال‌شده: ${stats.sent.toLocaleString("fa-IR")}
تحویل موفق: ${stats.delivered.toLocaleString("fa-IR")}
ناموفق: ${stats.failed.toLocaleString("fa-IR")}`;
}

const definitions: Record<FlowName, FlowDefinition> = {
  deposit_submit: {
    firstStep: "amount",
    prompt: async () => {
      const setting = await FinancialSettingsService.get();
      return `💳 مبلغ شارژ را به تومان وارد کنید:\n\nحداقل شارژ: ${money(setting.minimumTopupAmount)}\n\nفقط عدد را ارسال کنید؛ مثال: 250000`;
    },
    async handleText(ctx, text) {
      if (ctx.session.flow?.step === "amount") {
        const amount = Number(text.replace(/[,،\s]/g, ""));
        try {
          await FinancialSettingsService.validateTopupAmount(amount);
        } catch (error) {
          return { text: error instanceof Error ? error.message : "مبلغ معتبر نیست. یک عدد به تومان وارد کنید:" };
        }
        const wallets = await CryptoWalletService.listActive();
        if (wallets.length === 0) return { text: "در حال حاضر کیف پول فعالی برای پرداخت ثبت نشده است." };
        ctx.session.flow.data.amount = amount;
        ctx.session.flow.step = "wallet";
        return {
          text: `مبلغ شارژ: ${money(amount)}\n\nرمز ارز پرداخت را انتخاب کنید:`,
          nextStep: "wallet",
          keyboard: wallets.map((wallet) => [{ text: `${wallet.coinName} ${wallet.networkName}`, action: `deposit:wallet:${wallet.id}` }]),
        };
      }
      return { text: "لطفا رمز ارز را فقط از دکمه‌های نمایش داده‌شده انتخاب کنید." };
    },
    async handlePhoto(ctx, fileId) {
      const user = await requireUser(ctx);
      const depositId = String(ctx.session.flow?.data.depositId ?? "");
      if (!depositId) return { text: "ابتدا مبلغ شارژ را وارد کنید." };
      await DepositService.submitReceipt(depositId, user.id, fileId);
      return {
        done: true,
        text: "✅ رسید شما ثبت شد. تیم مالی در کوتاه‌ترین زمان پرداخت را بررسی می‌کند و نتیجه از همین ربات اطلاع‌رسانی می‌شود.",
        returnTo: { id: "wallet" },
      };
    },
  },
  ticket_reply: {
    firstStep: "message",
    prompt: "🎧 پیام خود را برای پشتیبانی بنویسید:\n\nاگر درباره خرید یا شارژ است، مبلغ یا شماره سفارش را هم ارسال کنید.",
    async handleText(ctx, text) {
      const ticketIdFromFlow = ctx.session.flow?.data.ticketId ? String(ctx.session.flow.data.ticketId) : undefined;
      if (ticketIdFromFlow && ctx.from && (await isAdminByTelegramId(ctx.from.id))) {
        const ticket = await SupportService.getTicketWithUser(ticketIdFromFlow);
        if (ticket?.status === "closed") await SupportService.reopenTicket(ticketIdFromFlow, String(ctx.from.id), "admin");
        await SupportService.addAdminReply(ticketIdFromFlow, String(ctx.from.id), text.trim());
        return { done: true, text: "✅ پاسخ پشتیبانی ارسال شد.", returnTo: { id: "admin.ticket", params: { ticketId: ticketIdFromFlow } } };
      }
      const user = await requireUser(ctx);
      const ticketId = ticketIdFromFlow ?? (await SupportService.createTicket(user.id)).id;
      await SupportService.addUserMessage(ticketId, user.id, text.trim());
      return { done: true, text: "✅ تیکت شما ثبت شد. پاسخ پشتیبانی در همین گفتگو برایتان ارسال می‌شود.", returnTo: { id: "support" } };
    },
  },
  coupon_code: {
    firstStep: "code",
    prompt: "🎟 کد تخفیف را وارد کنید:",
    async handleText(ctx, text) {
      const user = await requireUser(ctx);
      const productId = String(ctx.session.flow?.data.productId ?? "");

      try {
        await CouponService.validateForUser(text.trim(), user.id);

        ctx.session.selectedCoupons ??= {};
        ctx.session.selectedCoupons[productId] = text.trim().toUpperCase();

        return {
          done: true,
          text: "✅ کد تخفیف روی پیش‌فاکتور اعمال شد.",
          returnTo: { id: "shop.checkout", params: { productId } },
        };
      } catch (error) {
        return {
          text: error instanceof Error ? `❌ ${error.message}` : "❌ کد تخفیف معتبر نیست.",
        };
      }
    },
  },

  product_search: {
    firstStep: "query",
    prompt: "🔎 نام سرویس یا دسته‌بندی موردنظر را وارد کنید:\n\nمثلاً: Premium، یک‌ماهه، نام کشور یا نام دسته‌بندی",
    async handleText(ctx, text) {
      const query = text.trim();
      if (query.length < 2) return { text: "برای جستجوی دقیق‌تر، حداقل دو حرف وارد کنید:" };
      ctx.session.productSearchQuery = query;
      return { done: true, text: "✅ نتایج جستجو آماده شد.", returnTo: { id: "shop.searchResults", params: { q: query } } };
    },
  },

  broadcast_create: {
    firstStep: "message",
    prompt: async (ctx) => {
      const target = String(ctx.session.flow?.data.target ?? "");
      if (!BroadcastService.isTarget(target)) return "⚠️ گروه دریافت‌کنندگان معتبر نیست. لطفاً دوباره از منوی اطلاع‌رسانی اقدام کنید.";
      const count = await BroadcastService.countRecipients(target);
      return `📢 ارسال اطلاع‌رسانی

گروه مخاطب: ${BroadcastService.targetLabel(target)}
تعداد گیرندگان: ${count.toLocaleString("fa-IR")} نفر

متن پیام را ارسال کنید. قبل از ارسال نهایی، پیش‌نمایش و دکمه تایید نمایش داده می‌شود.`;
    },
    async handleText(ctx, text) {
      const flow = ctx.session.flow!;
      const target = String(flow.data.target ?? "");
      if (!BroadcastService.isTarget(target)) return { done: true, text: "⚠️ گروه دریافت‌کنندگان معتبر نیست.", returnTo: { id: "admin.notifications" } };
      if (flow.step === "message") {
        const message = text.trim();
        if (message.length < 3) return { text: "متن اطلاع‌رسانی خیلی کوتاه است. لطفاً متن کامل‌تری ارسال کنید:" };
        flow.data.message = message;
        flow.step = "confirm";
        const count = await BroadcastService.countRecipients(target);
        return {
          text: `📢 پیش‌نمایش اطلاع‌رسانی

گروه: ${BroadcastService.targetLabel(target)}
گیرندگان: ${count.toLocaleString("fa-IR")} نفر

متن پیام:
${message}

برای ارسال نهایی تایید کنید.`,
          nextStep: "confirm",
          keyboard: [[{ text: "✅ تایید و ارسال", action: "broadcast:confirm" }]],
        };
      }
      if (["ارسال", "تایید", "confirm", "send"].includes(text.trim().toLowerCase())) {
        const result = await completeBroadcast(ctx);
        return { done: true, text: result, returnTo: { id: "admin.notifications" } };
      }
      return { text: "برای ارسال نهایی از دکمه «✅ تایید و ارسال» استفاده کنید یا کلمه «ارسال» را بفرستید." };
    },
  },
  category_create: {
    firstStep: "fields",
    prompt: `📂 اطلاعات دسته‌بندی را ارسال کنید.

هر خط به شکل field: value

name: عنوان
description: توضیحات
icon: 📂
order: 1
active: true`,
    async handleText(ctx, text) {
      const data = parseKeyValueLines(text);
      const category = await AdminService.saveCategory(
        {
          name: data.name ?? data.title ?? data["عنوان"] ?? text.trim(),
          description: data.description ?? data["توضیحات"],
          icon: data.icon ?? data.emoji ?? data["آیکون"],
          displayOrder: data.order || data.sort || data["ترتیب"] ? parseInteger(data.order ?? data.sort ?? data["ترتیب"] ?? "0") : undefined,
          isActive: parseActive(data.active ?? data.status ?? data["وضعیت"]),
        },
        String(ctx.from?.id ?? "admin"),
      );
      return { done: true, text: "✅ دسته‌بندی ذخیره شد.", returnTo: { id: "admin.category", params: { categoryId: category.id } } };
    },
  },
  category_edit: {
    firstStep: "fields",
    prompt: async (ctx) => {
      const categoryId = String(ctx.session.flow?.data.categoryId ?? "");
      const detail = categoryId ? await AdminService.categoryDetail(categoryId) : undefined;
      if (!detail?.category) return "⚠️ دسته‌بندی پیدا نشد.";
      return `✏️ ویرایش دسته‌بندی ${detail.category.name}

هر فیلدی را که می‌خواهید تغییر کند در یک خط بفرستید.

name: ${detail.category.name}
description: ${detail.category.description ?? ""}
icon: ${detail.category.icon ?? ""}
order: ${detail.category.displayOrder}
active: ${detail.category.isActive}`;
    },
    async handleText(ctx, text) {
      const flow = ctx.session.flow!;
      const data = parseKeyValueLines(text);
      const categoryId = String(flow.data.categoryId);
      const category = await AdminService.saveCategory(
        {
          name: data.name ?? data.title ?? data["عنوان"],
          description: data.description ?? data["توضیحات"],
          icon: data.icon ?? data.emoji ?? data["آیکون"],
          displayOrder: data.order || data.sort || data["ترتیب"] ? parseInteger(data.order ?? data.sort ?? data["ترتیب"] ?? "0") : undefined,
          isActive: parseActive(data.active ?? data.status ?? data["وضعیت"]),
        },
        String(ctx.from?.id ?? "admin"),
        categoryId,
      );
      return { done: true, text: "✅ دسته‌بندی به‌روزرسانی شد.", returnTo: { id: "admin.category", params: { categoryId: category.id } } };
    },
  },
  product_create: {
    firstStep: "category",
    prompt: "📦 نام دسته‌بندی محصول را وارد کنید:",
    async handleText(ctx, text) {
      const flow = ctx.session.flow!;
      if (flow.step === "category") {
        flow.data.categoryName = text.trim();
        flow.step = "title";
        return { text: "نام محصول را وارد کنید:", nextStep: "title" };
      }
      if (flow.step === "title") {
        flow.data.title = text.trim();
        flow.step = "price";
        return { text: "قیمت محصول را به تومان وارد کنید:", nextStep: "price" };
      }
      if (flow.step === "price") {
        const price = Number(text.replace(/[,،\s]/g, ""));
        if (!Number.isInteger(price) || price < 0) return { text: "قیمت معتبر نیست. دوباره وارد کنید:" };
        flow.data.price = price;
        flow.step = "duration";
        return { text: "مدت سرویس را به روز وارد کنید:", nextStep: "duration" };
      }
      const duration = Number(text.replace(/[,،\s]/g, ""));
      if (!Number.isInteger(duration) || duration <= 0) return { text: "مدت معتبر نیست. دوباره وارد کنید:" };
      await ProductService.create({
        categoryName: String(flow.data.categoryName),
        title: String(flow.data.title),
        price: Number(flow.data.price),
        duration,
      });
      return { done: true, text: "✅ محصول جدید ثبت شد.", returnTo: { id: "admin.products" } };
    },
  },
  product_edit: {
    firstStep: "fields",
    prompt: async (ctx) => {
      const productId = String(ctx.session.flow?.data.productId ?? "");
      const detail = productId ? await AdminService.productDetail(productId) : undefined;
      if (!detail?.product) return "⚠️ محصول پیدا نشد.";
      return `✏️ ویرایش محصول ${detail.product.title}

هر فیلدی را که می‌خواهید تغییر کند در یک خط بفرستید.

title: ${detail.product.title}
categoryId: ${detail.product.categoryId}
price: ${detail.product.price}
duration: ${detail.product.duration}
active: ${detail.product.isActive}`;
    },
    async handleText(ctx, text) {
      const flow = ctx.session.flow!;
      const data = parseKeyValueLines(text);
      const productId = String(flow.data.productId);
      const product = await AdminService.updateProduct(
        productId,
        {
          title: data.title ?? data.name ?? data["عنوان"],
          categoryId: data.categoryId ?? data.category ?? data["دسته"],
          price: data.price || data["قیمت"] ? parseInteger(data.price ?? data["قیمت"] ?? "0") : undefined,
          duration: data.duration || data["مدت"] ? parseInteger(data.duration ?? data["مدت"] ?? "0") : undefined,
          isActive: parseActive(data.active ?? data.status ?? data["وضعیت"]),
        },
        String(ctx.from?.id ?? "admin"),
      );
      return { done: true, text: "✅ محصول به‌روزرسانی شد.", returnTo: { id: "admin.product", params: { productId: product.id } } };
    },
  },
  account_create: {
    firstStep: "username",
    prompt: "🔐 نام کاربری اکانت را وارد کنید:",
    async handleText(ctx, text) {
      const flow = ctx.session.flow!;
      if (flow.step === "username") {
        flow.data.username = text.trim();
        flow.step = "subscriptionLink";
        return { text: "لینک ساب اکانت را وارد کنید:", nextStep: "subscriptionLink" };
      }
      if (flow.step === "subscriptionLink") {
        flow.data.subscriptionLink = text.trim();
        flow.step = "configLink";
        return { text: "لینک کانفیگ را وارد کنید:", nextStep: "configLink" };
      }
      const productId = String(flow.data.productId);
      await ProductService.addAccount(productId, {
        username: String(flow.data.username),
        subscriptionLink: String(flow.data.subscriptionLink),
        configLink: text.trim(),
      });
      return { done: true, text: "✅ اکانت به موجودی محصول اضافه شد.", returnTo: { id: "admin.product", params: { productId } } };
    },
  },
  account_edit: {
    firstStep: "fields",
    prompt: async (ctx) => {
      const accountId = String(ctx.session.flow?.data.accountId ?? "");
      const account = accountId ? await AdminService.accountDetail(accountId) : undefined;
      if (!account) return "⚠️ اکانت پیدا نشد.";
      return `✏️ ویرایش اکانت ${account.username}

هر فیلدی را که می‌خواهید تغییر کند در یک خط بفرستید.

username: ${account.username}
subscriptionLink: ${account.subscriptionLink}
configLink: ${account.configLink}
productId: ${account.productId}
status: ${account.status}

وضعیت‌ها: available, reserved, sold, disabled, expired`;
    },
    async handleText(ctx, text) {
      const flow = ctx.session.flow!;
      const data = parseKeyValueLines(text);
      const accountId = String(flow.data.accountId);
      const account = await AdminService.updateAccount(
        accountId,
        {
          username: data.username ?? data["نام کاربری"],
          subscriptionLink: data.subscriptionLink ?? data.sub ?? data["ساب"],
          configLink: data.configLink ?? data.config ?? data["کانفیگ"],
          productId: data.productId ?? data.product ?? data["محصول"],
          status: parseProductAccountStatus(data.status ?? data["وضعیت"]),
        },
        String(ctx.from?.id ?? "admin"),
      );
      return { done: true, text: "✅ اکانت ذخیره شد.", returnTo: { id: "admin.account", params: { accountId: account.id } } };
    },
  },
  free_account_create: {
    firstStep: "username",
    prompt: "🎁 نام کاربری اکانت تست رایگان را وارد کنید:",
    async handleText(ctx, text) {
      const flow = ctx.session.flow!;
      if (flow.step === "username") {
        flow.data.username = text.trim();
        flow.step = "subscriptionLink";
        return { text: "لینک اشتراک اکانت تست را وارد کنید:", nextStep: "subscriptionLink" };
      }
      if (flow.step === "subscriptionLink") {
        flow.data.subscriptionLink = text.trim();
        flow.step = "configLink";
        return { text: "لینک کانفیگ اکانت تست را وارد کنید:", nextStep: "configLink" };
      }
      if (flow.step === "configLink") {
        flow.data.configLink = text.trim();
        flow.step = "durationDays";
        return { text: "مدت اعتبار اکانت تست را به روز وارد کنید:", nextStep: "durationDays" };
      }
      const durationDays = Number(text.replace(/[,،\s]/g, ""));
      if (!Number.isInteger(durationDays) || durationDays <= 0) return { text: "مدت اعتبار معتبر نیست. یک عدد مثبت وارد کنید:" };
      await FreeAccountService.addToInventory(
        {
          username: String(flow.data.username),
          subscriptionLink: String(flow.data.subscriptionLink),
          configLink: String(flow.data.configLink),
          durationDays,
        },
        String(ctx.from?.id ?? "admin"),
      );
      return { done: true, text: "✅ اکانت تست رایگان به موجودی مستقل اضافه شد.", returnTo: { id: "admin.freeAccounts" } };
    },
  },

  free_account_edit: {
    firstStep: "fields",
    prompt: async (ctx) => {
      const accountId = String(ctx.session.flow?.data.accountId ?? "");
      const account = accountId ? await FreeAccountService.getAccount(accountId) : undefined;
      if (!account) return "⚠️ اکانت تست پیدا نشد.";
      return `✏️ ویرایش اکانت تست

هر فیلدی را که می‌خواهید تغییر کند در یک خط بفرستید. فیلدهای مجاز:

username: ${account.username}
subscriptionLink: ${account.subscriptionLink}
configLink: ${account.configLink}
durationDays: ${account.durationDays}
status: ${account.status}

وضعیت‌های مجاز: available، assigned، expired`;
    },
    async handleText(ctx, text) {
      const flow = ctx.session.flow!;
      const data = Object.fromEntries(
        text
          .split(/\n+/)
          .map((line) => line.split(/[:=：]/, 2).map((part) => part.trim()))
          .filter((parts): parts is [string, string] => parts.length === 2 && Boolean(parts[0]) && Boolean(parts[1])),
      );
      const durationText = data.durationDays ?? data.duration ?? data["مدت"];
      const durationDays = durationText ? Number(durationText.replace(/[,،\s]/g, "")) : undefined;
      const status = data.status ?? data["وضعیت"];
      await FreeAccountService.updateAccount(
        String(flow.data.accountId),
        {
          username: data.username ?? data["نام کاربری"],
          subscriptionLink: data.subscriptionLink ?? data.sub ?? data["لینک اشتراک"],
          configLink: data.configLink ?? data.config ?? data["لینک کانفیگ"],
          durationDays,
          status: status === "available" || status === "assigned" || status === "expired" ? status : undefined,
        },
        String(ctx.from?.id ?? "admin"),
      );
      return { done: true, text: "✅ اکانت تست با موفقیت ویرایش شد.", returnTo: { id: "admin.freeAccounts" } };
    },
  },
  coupon_create: {
    firstStep: "code",
    prompt: "🎟 کد کوپن را وارد کنید:",
    async handleText(ctx, text) {
      const flow = ctx.session.flow!;
      if (flow.step === "code") {
        flow.data.code = text.trim();
        flow.step = "type";
        return { text: "نوع کوپن را وارد کنید (درصدی / ثابت):", nextStep: "type" };
      }
      if (flow.step === "type") {
        flow.data.type = text.includes("ثابت") || text.toLowerCase() === "fixed" ? "fixed" : "percentage";
        flow.step = "value";
        return { text: flow.data.type === "fixed" ? "مبلغ تخفیف را به تومان وارد کنید:" : "درصد تخفیف را وارد کنید:", nextStep: "value" };
      }
      if (flow.step === "value") {
        const value = Number(text.replace(/[,،\s]/g, ""));
        if (!Number.isInteger(value) || value <= 0 || (flow.data.type === "percentage" && value > 100)) return { text: "مقدار تخفیف معتبر نیست:" };
        flow.data.value = value;
        flow.step = "maxUses";
        return { text: "حداکثر تعداد استفاده کل را وارد کنید:", nextStep: "maxUses" };
      }
      if (flow.step === "maxUses") {
        const maxUses = Number(text.replace(/[,،\s]/g, ""));
        if (!Number.isInteger(maxUses) || maxUses <= 0) return { text: "تعداد معتبر نیست:" };
        flow.data.maxUses = maxUses;
        flow.step = "perUserLimit";
        return { text: "حداکثر استفاده هر کاربر را وارد کنید:", nextStep: "perUserLimit" };
      }
      if (flow.step === "perUserLimit") {
        const perUserLimit = Number(text.replace(/[,،\s]/g, ""));
        if (!Number.isInteger(perUserLimit) || perUserLimit <= 0) return { text: "محدودیت هر کاربر معتبر نیست:" };
        flow.data.perUserLimit = perUserLimit;
        flow.step = "minimumPurchaseAmount";
        return { text: "حداقل مبلغ خرید را به تومان وارد کنید (برای بدون حداقل، 0):", nextStep: "minimumPurchaseAmount" };
      }
      if (flow.step === "minimumPurchaseAmount") {
        const minimumPurchaseAmount = Number(text.replace(/[,،\s]/g, ""));
        if (!Number.isInteger(minimumPurchaseAmount) || minimumPurchaseAmount < 0) return { text: "حداقل مبلغ خرید معتبر نیست:" };
        flow.data.minimumPurchaseAmount = minimumPurchaseAmount;
        flow.step = "days";
        return { text: "اعتبار کوپن چند روز باشد؟", nextStep: "days" };
      }
      const days = Number(text.replace(/[,،\s]/g, ""));
      if (!Number.isInteger(days) || days <= 0) return { text: "تعداد روز معتبر نیست:" };
      await CouponService.createAdvanced(
        {
          code: String(flow.data.code),
          type: flow.data.type === "fixed" ? "fixed" : "percentage",
          value: Number(flow.data.value),
          maxUses: Number(flow.data.maxUses),
          perUserLimit: Number(flow.data.perUserLimit),
          minimumPurchaseAmount: Number(flow.data.minimumPurchaseAmount),
          expiresAt: new Date(Date.now() + days * 86_400_000),
        },
        String(ctx.from?.id ?? "admin"),
      );
      return { done: true, text: "✅ کوپن جدید ساخته شد.", returnTo: { id: "admin.coupons" } };
    },
  },
  coupon_edit: {
    firstStep: "fields",
    prompt: async (ctx) => {
      const couponId = String(ctx.session.flow?.data.couponId ?? "");
      const coupon = couponId ? await AdminService.couponDetail(couponId) : undefined;
      if (!coupon) return "⚠️ کوپن پیدا نشد.";
      return `✏️ ویرایش کوپن ${coupon.code}

هر فیلدی را که می‌خواهید تغییر کند در یک خط و به شکل field: value بفرستید.

فیلدهای مجاز:
code: ${coupon.code}
type: ${coupon.type} (percentage/fixed)
value: ${coupon.value}
maxUses: ${coupon.maxUses}
perUserLimit: ${coupon.perUserLimit}
minimumPurchaseAmount: ${coupon.minimumPurchaseAmount}
expiresInDays: تعداد روز اعتبار جدید
status: ${coupon.status} (active/inactive)`;
    },
    async handleText(ctx, text) {
      const flow = ctx.session.flow!;
      const data = Object.fromEntries(
        text
          .split(/\n+/)
          .map((line) => line.split(/[:=：]/, 2).map((part) => part.trim()))
          .filter((parts): parts is [string, string] => parts.length === 2 && Boolean(parts[0]) && Boolean(parts[1])),
      );
      const type = parseCouponType(data.type ?? data["نوع"]);
      const expiresInDaysText = data.expiresInDays ?? data.days ?? data["روز"] ?? data["اعتبار"];
      const expiresInDays = expiresInDaysText ? parseInteger(expiresInDaysText) : undefined;
      const patch = {
        code: data.code ?? data["کد"],
        type,
        value: data.value ? parseInteger(data.value) : data["مقدار"] ? parseInteger(data["مقدار"]) : undefined,
        maxUses: data.maxUses ? parseInteger(data.maxUses) : data["حداکثر"] ? parseInteger(data["حداکثر"]) : undefined,
        perUserLimit: data.perUserLimit ? parseInteger(data.perUserLimit) : data["هر کاربر"] ? parseInteger(data["هر کاربر"]) : undefined,
        minimumPurchaseAmount: data.minimumPurchaseAmount ? parseInteger(data.minimumPurchaseAmount) : data.minimum ? parseInteger(data.minimum) : data["حداقل خرید"] ? parseInteger(data["حداقل خرید"]) : undefined,
        expiresAt: expiresInDays ? new Date(Date.now() + expiresInDays * 86_400_000) : undefined,
        status: parseStatus(data.status ?? data["وضعیت"]),
      };
      if (!Object.values(patch).some((value) => value !== undefined)) return { text: "هیچ فیلد معتبری دریافت نشد. مثال:\nvalue: 20\nmaxUses: 100" };
      await CouponService.update(String(flow.data.couponId), patch, String(ctx.from?.id ?? "admin"));
      return { done: true, text: "✅ کوپن با موفقیت ویرایش شد.", returnTo: { id: "admin.coupon", params: { couponId: String(flow.data.couponId) } } };
    },
  },

  product_price: {
    firstStep: "price",
    prompt: "💰 قیمت جدید محصول را به تومان وارد کنید:",
    async handleText(ctx, text) {
      const price = Number(text.replace(/[,،\s]/g, ""));
      if (!Number.isInteger(price) || price < 0) return { text: "قیمت معتبر نیست:" };
      const productId = String(ctx.session.flow?.data.productId);
      await AdminService.updateProductPrice(productId, price, String(ctx.from?.id ?? "admin"));
      return { done: true, text: "✅ قیمت محصول به‌روزرسانی شد.", returnTo: { id: "admin.product", params: { productId } } };
    },
  },

  crypto_wallet_create: {
    firstStep: "coin",
    prompt: `💎 نام رمز ارز را وارد کنید (${CryptoWalletService.supportedCoins().join(" / ")}):`,
    async handleText(ctx, text) {
      const flow = ctx.session.flow!;
      if (flow.step === "coin") {
        flow.data.coinName = text.trim().toUpperCase();
        flow.step = "network";
        return { text: "🌐 نام شبکه را وارد کنید (مثلا TRC20):", nextStep: "network" };
      }
      if (flow.step === "network") {
        flow.data.networkName = text.trim();
        flow.step = "address";
        return { text: "🏦 آدرس کیف پول را وارد کنید:", nextStep: "address" };
      }
      if (flow.step === "address") {
        flow.data.walletAddress = text.trim();
        flow.step = "status";
        return { text: "وضعیت کیف پول را وارد کنید (فعال / غیرفعال):", nextStep: "status" };
      }
      const status = text.includes("غیر") || text.toLowerCase() === "inactive" ? "inactive" : "active";
      await AdminService.saveCryptoWallet(
        { coinName: String(flow.data.coinName), networkName: String(flow.data.networkName), walletAddress: String(flow.data.walletAddress), status },
        String(ctx.from?.id ?? "admin"),
      );
      return { done: true, text: "✅ کیف پول رمز ارزی ذخیره شد. نرخ به‌صورت خودکار دریافت می‌شود.", returnTo: { id: "admin.wallets" } };
    },
  },
  crypto_wallet_edit: {
    firstStep: "fields",
    prompt: async (ctx) => {
      const walletId = String(ctx.session.flow?.data.walletId ?? "");
      const detail = walletId ? await AdminService.walletDetail(walletId) : undefined;
      if (!detail?.wallet) return "⚠️ کیف پول پیدا نشد.";
      return `✏️ ویرایش کیف پول ${detail.wallet.displayName ?? detail.wallet.coinName}

هر فیلدی را که می‌خواهید تغییر کند در یک خط بفرستید.

coinName: ${detail.wallet.coinName}
coinSymbol: ${detail.wallet.coinSymbol ?? detail.wallet.coinName}
networkName: ${detail.wallet.networkName}
displayName: ${detail.wallet.displayName ?? ""}
walletAddress: ${detail.wallet.walletAddress}
displayOrder: ${detail.wallet.displayOrder}
status: ${detail.wallet.status}`;
    },
    async handleText(ctx, text) {
      const flow = ctx.session.flow!;
      const data = parseKeyValueLines(text);
      const walletId = String(flow.data.walletId);
      const wallet = await AdminService.saveCryptoWallet(
        {
          coinName: data.coinName ?? data.coin ?? data["نام ارز"],
          coinSymbol: data.coinSymbol ?? data.symbol ?? data["نماد"],
          networkName: data.networkName ?? data.network ?? data["شبکه"],
          displayName: data.displayName ?? data.display ?? data["نام نمایشی"],
          walletAddress: data.walletAddress ?? data.address ?? data["آدرس"],
          displayOrder: data.displayOrder || data.order || data.sort || data["ترتیب"] ? parseInteger(data.displayOrder ?? data.order ?? data.sort ?? data["ترتیب"] ?? "0") : undefined,
          status: parseStatus(data.status ?? data.active ?? data["وضعیت"]),
        },
        String(ctx.from?.id ?? "admin"),
        walletId,
      );
      return { done: true, text: "✅ کیف پول به‌روزرسانی شد.", returnTo: { id: "admin.wallet", params: { walletId: wallet.id } } };
    },
  },
  minimum_topup: {
    firstStep: "amount",
    prompt: "💳 حداقل شارژ کیف پول را به تومان وارد کنید:",
    async handleText(ctx, text) {
      const amount = Number(text.replace(/[,،\s]/g, ""));
      if (!Number.isInteger(amount) || amount <= 0) return { text: "مبلغ معتبر نیست. فقط عدد مثبت وارد کنید:" };
      await AdminService.setMinimumTopupAmount(amount, String(ctx.from?.id ?? "admin"));
      return { done: true, text: "✅ حداقل شارژ کیف پول ذخیره شد.", returnTo: { id: "admin.crypto" } };
    },
  },
  referral_tier_create: {
    firstStep: "threshold",
    prompt: "🎁 تعداد دعوت مورد نیاز برای سطح پاداش را وارد کنید:",
    async handleText(ctx, text) {
      const flow = ctx.session.flow!;
      if (flow.step === "threshold") {
        const threshold = Number(text.replace(/[,،\s]/g, ""));
        if (!Number.isInteger(threshold) || threshold <= 0) return { text: "تعداد دعوت معتبر نیست:" };
        flow.data.threshold = threshold;
        flow.step = "amount";
        return { text: "مبلغ پاداش را به تومان وارد کنید:", nextStep: "amount" };
      }
      const amount = Number(text.replace(/[,،\s]/g, ""));
      if (!Number.isInteger(amount) || amount <= 0) return { text: "مبلغ معتبر نیست:" };
      await ReferralService.upsertTier(Number(flow.data.threshold), amount, String(ctx.from?.id ?? "admin"));
      return { done: true, text: "✅ سطح پاداش دعوت ذخیره شد.", returnTo: { id: "admin.referrals" } };
    },
  },
  store_status: {
    firstStep: "status",
    prompt: "وضعیت فروشگاه را وارد کنید (فعال / غیرفعال):",
    async handleText(ctx, text) {
      const status = text.includes("غیر") || text.toLowerCase() === "inactive" ? "inactive" : "active";
      await AdminService.setStoreStatus(status, String(ctx.from?.id ?? "admin"));
      return { done: true, text: "✅ وضعیت فروشگاه ذخیره شد.", returnTo: { id: "admin.store" } };
    },
  },
  forced_join_create: {
    firstStep: "chatId",
    prompt: "📢 شناسه کانال عضویت اجباری را وارد کنید (مثلاً @channel یا -100...):",
    async handleText(ctx, text) {
      const flow = ctx.session.flow!;
      if (flow.step === "chatId") {
        flow.data.chatId = text.trim();
        flow.step = "title";
        return { text: "عنوان نمایشی کانال را وارد کنید:", nextStep: "title" };
      }
      if (flow.step === "title") {
        flow.data.title = text.trim();
        flow.step = "inviteLink";
        return { text: "لینک عضویت کانال را وارد کنید. برای کانال عمومیِ @username می‌توانید «-» بفرستید:", nextStep: "inviteLink" };
      }
      try {
        await AdminService.saveForcedJoinChannel(
          { chatId: String(flow.data.chatId), title: String(flow.data.title), inviteLink: text.trim() === "-" ? undefined : text.trim(), status: "active" },
          String(ctx.from?.id ?? "admin"),
        );
      } catch (error) {
        return { text: error instanceof Error ? `⚠️ ${error.message}

لینک عضویت معتبر را وارد کنید:` : "⚠️ ذخیره کانال ناموفق بود. لینک عضویت را دوباره وارد کنید:" };
      }
      return { done: true, text: "✅ کانال عضویت اجباری ذخیره شد.", returnTo: { id: "admin.forcedJoin" } };
    },
  },

  wallet_adjust: {
    firstStep: "amount",
    prompt: "💳 مبلغ تغییر موجودی را به تومان وارد کنید:",
    async handleText(ctx, text) {
      const amount = Number(text.replace(/[,،\s]/g, ""));
      if (!Number.isInteger(amount) || amount <= 0) return { text: "مبلغ معتبر نیست:" };
      const flow = ctx.session.flow!;
      const signedAmount = flow.data.mode === "debit" ? -amount : amount;
      await AdminService.adjustUserBalance(String(flow.data.userId), signedAmount, "تغییر موجودی توسط مدیر", String(ctx.from?.id ?? "admin"));
      return { done: true, text: "✅ موجودی کاربر به‌روزرسانی شد.", returnTo: { id: "admin.user", params: { userId: String(flow.data.userId) } } };
    },
  },
};

function isFlowName(value: string): value is FlowName {
  return Object.prototype.hasOwnProperty.call(definitions, value);
}

export async function startFlow(ctx: AppContext, name: FlowName, data: Record<string, string | number | boolean | undefined> = {}) {
  const definition = definitions[name];
  if (!definition) throw new Error("جریان پیدا نشد");
  ctx.session.flow = { name, step: definition.firstStep, data, returnTo: currentReturnTo(ctx) };
  await flowPrompt(ctx, typeof definition.prompt === "function" ? await definition.prompt(ctx) : definition.prompt);
}

export async function handleActiveFlowText(ctx: AppContext, text: string) {
  const flow = ctx.session.flow;
  if (!flow) return false;
  const result = await definitions[flow.name].handleText?.(ctx, text);
  if (!result) return false;
  if (result.done) {
    ctx.session.flow = undefined;
    await ctx.reply(result.text);
    await renderPanel(ctx, result.returnTo ?? flow.returnTo ?? { id: "home" }, "replace");
    return true;
  }
  await flowPrompt(ctx, result.text, result.keyboard);
  return true;
}

export async function handleActiveFlowPhoto(ctx: AppContext, fileId: string) {
  const flow = ctx.session.flow;
  if (!flow) return false;
  const result = await definitions[flow.name].handlePhoto?.(ctx, fileId);
  if (!result) return false;
  if (result.done) {
    ctx.session.flow = undefined;
    await ctx.reply(result.text);
    await renderPanel(ctx, result.returnTo ?? flow.returnTo ?? { id: "home" }, "replace");
    return true;
  }
  await flowPrompt(ctx, result.text, result.keyboard);
  return true;
}

export function registerFlowEngine(bot: AppBot) {
  bot.action("flow:cancel", async (ctx) => {
    ctx.session.flow = undefined;
    await ctx.answerCbQuery("لغو شد");
    await renderPanel(ctx, currentReturnTo(ctx), "replace");
  });

  bot.action("broadcast:confirm", async (ctx) => {
    const flow = ctx.session.flow;
    if (!flow || flow.name !== "broadcast_create" || flow.step !== "confirm") {
      await ctx.answerCbQuery("درخواست ارسال فعالی وجود ندارد");
      return;
    }
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) {
      await ctx.answerCbQuery("دسترسی غیرمجاز");
      return;
    }
    await ctx.answerCbQuery("در حال ارسال...");
    const result = await completeBroadcast(ctx);
    ctx.session.flow = undefined;
    await ctx.reply(result);
    await renderPanel(ctx, { id: "admin.notifications" }, "replace");
  });

  bot.action(/^flow:start:([^:]+)(?::([^:]+))?(?::([^:]+))?$/, async (ctx) => {
    await ctx.answerCbQuery();
    const name = ctx.match[1];
    if (!isFlowName(name)) {
      await ctx.answerCbQuery("جریان نامعتبر است");
      return;
    }
    if (name === "coupon_code") return startFlow(ctx, "coupon_code", { productId: ctx.match[2] });
    const adminOnlyFlows: FlowName[] = ["product_create", "product_edit", "account_create", "account_edit", "coupon_create", "coupon_edit", "category_create", "category_edit", "product_price", "crypto_wallet_create", "crypto_wallet_edit", "minimum_topup", "referral_tier_create", "store_status", "forced_join_create", "wallet_adjust", "broadcast_create", "free_account_create", "free_account_edit"];
    if (adminOnlyFlows.includes(name) && (!ctx.from || !(await isAdminByTelegramId(ctx.from.id)))) {
      await ctx.answerCbQuery("دسترسی غیرمجاز");
      return;
    }
    if (name === "coupon_edit") return startFlow(ctx, "coupon_edit", { couponId: ctx.match[2] });
    if (name === "broadcast_create") return startFlow(ctx, "broadcast_create", { target: ctx.match[2] });
    if (name === "category_edit") return startFlow(ctx, "category_edit", { categoryId: ctx.match[2] });
    if (name === "product_edit") return startFlow(ctx, "product_edit", { productId: ctx.match[2] });
    if (name === "account_create") return startFlow(ctx, "account_create", { productId: ctx.match[2] });
    if (name === "account_edit") return startFlow(ctx, "account_edit", { accountId: ctx.match[2] });
    if (name === "crypto_wallet_edit") return startFlow(ctx, "crypto_wallet_edit", { walletId: ctx.match[2] });
    if (name === "free_account_create" || name === "free_account_edit") {
      if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) {
        await ctx.answerCbQuery("دسترسی غیرمجاز");
        return;
      }
      if (name === "free_account_create") return startFlow(ctx, "free_account_create", { productId: ctx.match[2] });
      return startFlow(ctx, "free_account_edit", { accountId: ctx.match[2] });
    }
    if (name === "ticket_reply") return startFlow(ctx, "ticket_reply", { ticketId: ctx.match[2] });
    if (name === "wallet_adjust") return startFlow(ctx, "wallet_adjust", { userId: ctx.match[2], mode: ctx.match[3] });
    if (name === "product_price") return startFlow(ctx, "product_price", { productId: ctx.match[2] });
    return startFlow(ctx, name);
  });
}
