import type { AppBot, AppContext, FlowName } from "../../types/bot";
import { renderPanel, callbackFor, panelKeyboard, actionFor, RenderMode, type UiKeyboard, type ViewState } from "../navigation/panel-ui";
import { UserService } from "../../modules/user/user.service";
import { ProductService } from "../../modules/product/product.service";
import { CouponService } from "../../modules/coupon/coupon.service";
import { CryptoWalletService, DepositService, FinancialSettingsService } from "../../modules/deposit/deposit.service";
import { SupportService } from "../../modules/support/support.service";
import { AdminService, type ProductAccountAdminStatus } from "../../modules/admin/admin.service";
import { XrayClientService, XrayPanelService, xrayInboundSnapshot, type XrayPanelConfigPatch } from "../../modules/xray/xray.service";
import { FreeAccountService } from "../../modules/free-account/free-account.service";
import { ReferralService } from "../../modules/referral/referral.service";
import { BroadcastService } from "../../modules/broadcast/broadcast.service";
import { PaymentGatewayService, PaymentInvoiceService, type PaymentGatewayInput } from "../../modules/payment/payment.service";
import { ProductGuideService } from "../../modules/system/product-guide.service";
import { isAdminByTelegramId } from "../middlewares/admin.middleware";
import { MainMenuKeyboard } from "../keyboards/design-system";

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


export function parseKeyValueLines(text: string): Record<string, string> {
  const entries: [string, string][] = [];
  const aliases: Record<string, string> = { url: "apiBaseUrl", baseUrl: "apiBaseUrl", token: "apiToken", اشتراک: "subscriptionBaseUrl", فعال: "enabled", وضعیت: "enabled", name: "title", "عنوان": "title", "قیمت": "price", "مدت": "durationDays", "حجم": "trafficGB", "موجودی": "stockLimit", "دسته": "categoryId" };
  const allowed = new Set(["apiBaseUrl", "apiToken", "subscriptionBaseUrl", "enabled", "url", "baseUrl", "token", "اشتراک", "فعال", "وضعیت", "title", "name", "categoryId", "category", "price", "duration", "durationDays", "trafficGB", "stockLimit", "active", "عنوان", "قیمت", "مدت", "حجم", "موجودی", "دسته"]);
  for (const rawLine of text.split(/\n+/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const index = line.indexOf(":");
    if (index <= 0) throw new Error(`خط نامعتبر است: ${line}\nفرمت صحیح: key: value`);
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim();
    if (!allowed.has(key)) throw new Error(`کلید «${key}» پشتیبانی نمی‌شود.`);
    entries.push([aliases[key] ?? key, value]);
  }
  return Object.fromEntries(entries);
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
  initialKeyboard?: (ctx: AppContext) => Promise<UiKeyboard> | UiKeyboard;
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

async function productCategoryKeyboard(): Promise<UiKeyboard> {
  const categories = await ProductService.listSelectableCategoriesForAdmin(40);
  return categories.map((category) => [
    { text: `${category.icon ?? "📂"} ${category.name}`, action: actionFor("flow:product_category", category.id) },
  ]);
}

function requireUser(ctx: AppContext) {
  if (!ctx.from) throw new Error("کاربر پیدا نشد");
  return UserService.getByTelegramId(ctx.from.id).then((user) => {
    if (!user) throw new Error("کاربر پیدا نشد");
    return user;
  });
}


function paymentFlowReplyKeyboard() {
  return MainMenuKeyboard().reply_markup;
}

function paymentGatewaySavedMessage(field: keyof PaymentGatewayInput, config: Awaited<ReturnType<typeof PaymentGatewayService.getConfig>>) {
  if (field === "apiKey") return `✅ API Key ذخیره شد\n\nمقدار جدید از دیتابیس:\n********${config.apiKey.slice(-4).toUpperCase()}`;
  if (field === "callbackUrl") return `✅ Callback URL ذخیره شد\n\nمقدار جدید از دیتابیس:\n${config.callbackUrl || "—"}`;
  if (field === "apiBaseUrl") return `✅ API URL ذخیره شد\n\nمقدار جدید از دیتابیس:\n${config.apiBaseUrl || "—"}`;
  if (field === "gatewayName") return `✅ نام نمایشی ذخیره شد\n\nمقدار جدید از دیتابیس:\n${config.gatewayName || "—"}`;
  if (field === "displayOrder") return `✅ ترتیب نمایش ذخیره شد\n\nمقدار جدید از دیتابیس:\n${config.displayOrder.toLocaleString("fa-IR")}`;
  if (field === "enabled") return `✅ وضعیت درگاه ذخیره شد\n\nمقدار جدید از دیتابیس:\n${config.enabled ? "فعال" : "غیرفعال"}`;
  return "✅ تنظیمات ذخیره شد";
}


async function completePaymentGatewaySetup(ctx: AppContext) {
  const data = ctx.session.flow?.data ?? {};
  const saved = await PaymentGatewayService.saveConfig({
    apiBaseUrl: String(data.apiBaseUrl ?? ""),
    apiKey: String(data.apiKey ?? ""),
    callbackUrl: String(data.callbackUrl ?? ""),
    gatewayName: String(data.gatewayName ?? ""),
  }, String(ctx.from?.id ?? "admin"));
  PaymentGatewayService.validateConfig({ ...saved, enabled: true });
  const result = await PaymentGatewayService.testConnection(String(ctx.from?.id ?? "admin"));
  if (result.ok) await PaymentGatewayService.updateConfigField("enabled", true, String(ctx.from?.id ?? "admin"));
  ctx.session.flow = undefined;
  await ctx.reply(`✅ تنظیمات با موفقیت ذخیره شد\n\n${result.ok ? "📡 تست اتصال موفق بود" : `📡 تست اتصال ناموفق بود\n${result.error}`}\n\n${result.ok ? "درگاه آماده استفاده است." : "لطفاً اطلاعات درگاه را بررسی کنید."}`);
  await renderPanel(ctx, { id: "admin.paymentGateway" }, "replace");
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
  instant_topup: {
    firstStep: "amount",
    prompt: async () => {
      const setting = await FinancialSettingsService.get();
      return `💰 شارژ کیف پول با پرداخت آنی

حداقل شارژ: ${money(setting.minimumTopupAmount)}

مبلغ را فقط به تومان وارد کنید. پس از پرداخت موفق، callback رسمی درگاه تأیید پرداخت محسوب می‌شود و کیف پول شما خودکار شارژ خواهد شد.`;
    },
    async handleText(ctx, text) {
      const user = await requireUser(ctx);
      const amount = Number(text.replace(/[,،\s]/g, ""));
      try {
        await FinancialSettingsService.validateTopupAmount(amount);
        const invoice = await PaymentInvoiceService.createWalletTopupInvoice(user.id, amount);
        return {
          done: true,
          text: `🧾 فاکتور پرداخت آماده شد

💰 مبلغ نهایی:
${money(amount)}
⚡ روش پرداخت:
پرداخت آنی

برای ادامه، روی دکمه پرداخت بزنید.

⚡ لینک پرداخت:
${invoice.paymentLink}`,
          returnTo: { id: "wallet" },
        };
      } catch (error) {
        return { text: error instanceof Error ? `❌ ${error.message}` : "❌ ایجاد پرداخت ناموفق بود" };
      }
    },
  },
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
          keyboard: wallets.map((wallet) => [{ text: `${wallet.coinName} ${wallet.networkName}`, action: actionFor("deposit:wallet", wallet.id) }]),
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
        const product = await ProductService.getProduct(productId);
        if (!product) throw new Error("محصول پیدا نشد");
        if (ctx.session.selectedCoupons?.[productId]) delete ctx.session.selectedCoupons[productId];
        const validation = await CouponService.validateForCheckout({ code: text.trim(), userId: user.id, originalAmount: product.price });
        if (!validation.ok) {
          return {
            text: `❌ کد تخفیف قابل استفاده نیست\n\nدلیل:\n${validation.reason}`,
          };
        }

        ctx.session.selectedCoupons ??= {};
        ctx.session.selectedCoupons[productId] = validation.coupon.code;

        return {
          done: true,
          text: `✅ کد تخفیف اعمال شد\n\n💰 مبلغ اصلی:\n${validation.originalAmount.toLocaleString("fa-IR")} تومان\n\n🎁 تخفیف:\n${validation.discountAmount.toLocaleString("fa-IR")} تومان\n\n✅ مبلغ نهایی:\n${validation.finalAmount.toLocaleString("fa-IR")} تومان`,
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
      if (!BroadcastService.isTarget(target)) {
        return "⚠️ گروه دریافت‌کنندگان معتبر نیست. لطفاً دوباره از منوی اطلاع‌رسانی اقدام کنید.";
      }

      const count = await BroadcastService.countRecipients(target);

      return `📢 ارسال اطلاع‌رسانی

گروه مخاطب: ${BroadcastService.targetLabel(target)}
تعداد گیرندگان: ${count.toLocaleString("fa-IR")} نفر

متن پیام را ارسال کنید. قبل از ارسال نهایی، پیش‌نمایش و دکمه تایید نمایش داده می‌شود.`;
    },

    async handleText(ctx, text) {
      const flow = ctx.session.flow!;
      const target = String(flow.data.target ?? "");

      if (!BroadcastService.isTarget(target)) {
        return {
          done: true,
          text: "⚠️ گروه دریافت‌کنندگان معتبر نیست.",
          returnTo: { id: "admin.notifications" },
        };
      }

      if (flow.step === "message") {
        const message = text.trim();

        if (message.length < 3) {
          return {
            text: "متن اطلاع‌رسانی خیلی کوتاه است. لطفاً متن کامل‌تری ارسال کنید:",
          };
        }

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
          keyboard: [
            [
              {
                text: "✅ تایید و ارسال",
                action: actionFor("broadcast:confirm"),
              },
            ],
          ],
        };
      }

      if (["ارسال", "تایید", "confirm", "send"].includes(text.trim().toLowerCase())) {
        const result = await completeBroadcast(ctx);

        return {
          done: true,
          text: result,
          returnTo: { id: "admin.notifications" },
        };
      }

      return {
        text: "برای ارسال نهایی از دکمه «✅ تایید و ارسال» استفاده کنید یا کلمه «ارسال» را بفرستید.",
      };
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
  // Product create group buttons are populated by showXrayGroupPicker via XrayClientService.listGroups().
  product_create: {
    firstStep: "category",
    prompt: "📂 ابتدا دسته‌بندی محصول را انتخاب کنید. فقط دسته‌بندی‌های فعال نمایش داده می‌شوند.",
    initialKeyboard: productCategoryKeyboard,
    async handleText(ctx, text) {
      const flow = ctx.session.flow!;
      if (flow.step === "category") {
        return { text: "لطفاً دسته‌بندی را از دکمه‌های زیر انتخاب کنید.", keyboard: await productCategoryKeyboard() };
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
        flow.step = "traffic";
        return { text: "حجم سرویس را به گیگابایت وارد کنید:", nextStep: "traffic" };
      }
      if (flow.step === "traffic") {
        const traffic = Number(text.replace(/[,،\s]/g, ""));
        if (!Number.isInteger(traffic) || traffic <= 0) return { text: "حجم معتبر نیست. دوباره وارد کنید:" };
        flow.data.trafficGB = traffic;
        flow.step = "duration";
        return { text: "مدت سرویس را به روز وارد کنید:", nextStep: "duration" };
      }
      if (flow.step === "duration") {
        const duration = Number(text.replace(/[,،\s]/g, ""));
        if (!Number.isInteger(duration) || duration <= 0) return { text: "مدت معتبر نیست. دوباره وارد کنید:" };
        flow.data.duration = duration;
        flow.step = "stock";
        return { text: "محدودیت فروش/موجودی محصول را وارد کنید:", nextStep: "stock" };
      }
      if (flow.step === "stock") {
        const stock = Number(text.replace(/[,،\s]/g, ""));
        if (!Number.isInteger(stock) || stock < 0) return { text: "موجودی معتبر نیست. دوباره وارد کنید:" };
        flow.data.stockLimit = stock;
        flow.step = "limitIp";
        return { text: "🌐 محدودیت IP را وارد کنید\n\nمثال:\n0 = نامحدود\n1 = فقط یک IP\n2 = دو IP همزمان\n\n۰ یعنی بدون محدودیت", nextStep: "limitIp" };
      }
      if (flow.step === "limitIp") {
        const limitIp = Number(text.replace(/[,،\s]/g, ""));
        if (!Number.isInteger(limitIp) || limitIp < 0) return { text: "محدودیت IP معتبر نیست. عددی بزرگ‌تر یا مساوی ۰ وارد کنید:\n۰ یعنی بدون محدودیت" };
        flow.data.limitIp = limitIp;
        flow.step = "group";
        return { text: "👥 انتخاب گروه کلاینت\n\nلطفاً گروه کلاینت را از دکمه‌های زیر انتخاب کنید.", keyboard: [[{ text: "👥 انتخاب گروه", action: "admin:xray_picker:group:product_create" }]] };
      }
      if (flow.step !== "confirm") return { text: "لطفاً انتخاب گروه و اینباند را با دکمه‌های فرم انجام دهید." };
      const groupName = flow.data.xrayGroupName ? String(flow.data.xrayGroupName) : null;
      const duration = Number(flow.data.duration);
      const categoryId = String(flow.data.categoryId ?? "");
      if (!categoryId) return { text: "⚠️ دسته‌بندی نامعتبر یا حذف‌شده است. دوباره دسته‌بندی را انتخاب کنید.", keyboard: await productCategoryKeyboard() };
      await ProductService.create({
        mode: "xray_auto",
        categoryId,
        title: String(flow.data.title),
        price: Number(flow.data.price),
        duration,
        durationDays: duration,
        trafficGB: Number(flow.data.trafficGB),
        stockLimit: Number(flow.data.stockLimit),
        inboundIds: (flow.data as any).inboundIds as number[],
        inboundSnapshot: String((flow.data as any).inboundSnapshot),
        limitIp: Number(flow.data.limitIp ?? 0),
        xrayGroupName: groupName,
      });
      return { done: true, text: "✅ محصول Xray با موجودی خودکار ثبت شد.", returnTo: { id: "admin.products" } };
    },
  },
  product_edit: {
    firstStep: "fields",
    initialKeyboard: productCategoryKeyboard,
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
active: ${detail.product.isActive}
${detail.product.mode === "xray_auto" ? `trafficGB: ${detail.product.trafficBytes ? Number(detail.product.trafficBytes) / 1_073_741_824 : ""}
durationDays: ${detail.product.durationDays ?? detail.product.duration}
stockLimit: ${detail.product.stockLimit ?? ""}
limitIp: ${detail.product.xrayLimitIp ?? 0}
group: ${detail.product.xrayGroupName ?? ""}

نکته: تغییر حجم/مدت/اینباند فقط روی خریدهای بعدی اعمال می‌شود و سرویس‌های قبلی را تغییر نمی‌دهد.` : ""}

برای تغییر دسته‌بندی می‌توانید یکی از دکمه‌های دسته‌بندی فعال را انتخاب کنید.`;
    },
    async handleText(ctx, text) {
      const flow = ctx.session.flow!;
      const productId = String(flow.data.productId);
      const selectedCategoryId = flow.data.categoryId ? String(flow.data.categoryId) : undefined;
      const field = flow.data.field ? String(flow.data.field) : undefined;
      const detail = await AdminService.productDetail(productId);
      const isXray = detail.product?.mode === "xray_auto";
      const validFields = new Set(["title", "price", "category", "trafficGB", "durationDays", "stockLimit", "limitIp"]);
      if (field && !validFields.has(field)) return { done: true, text: "⚠️ فیلد ویرایش معتبر نیست.", returnTo: { id: "admin.product", params: { productId } } };
      const patch: any = {};
      if (field) {
        if (["trafficGB", "durationDays", "stockLimit", "limitIp"].includes(field) && !isXray) return { done: true, text: "⚠️ این فیلد فقط برای محصولات Xray است.", returnTo: { id: "admin.product", params: { productId } } };
        if (field === "title") patch.title = text.trim();
        if (field === "price") patch.price = parseInteger(text);
        if (field === "category") patch.categoryId = selectedCategoryId || text.trim();
        if (field === "trafficGB") patch.trafficGB = parseInteger(text);
        if (field === "durationDays") patch.durationDays = parseInteger(text);
        if (field === "stockLimit") patch.stockLimit = parseInteger(text);
        if (field === "limitIp") patch.xrayLimitIp = parseInteger(text);
      } else {
        const data = parseKeyValueLines(text);
        Object.assign(patch, {
          title: data.title ?? data.name ?? data["عنوان"],
          categoryId: data.categoryId ?? data.category ?? data["دسته"] ?? selectedCategoryId,
          price: data.price || data["قیمت"] ? parseInteger(data.price ?? data["قیمت"] ?? "0") : undefined,
          duration: data.duration || (!isXray && data.durationDays) ? parseInteger(data.duration ?? data.durationDays ?? "0") : undefined,
          trafficGB: isXray && (data.trafficGB || data["حجم"]) ? parseInteger(data.trafficGB ?? data["حجم"] ?? "0") : undefined,
          durationDays: isXray && data.durationDays ? parseInteger(data.durationDays) : undefined,
          stockLimit: isXray && (data.stockLimit || data["موجودی"]) ? parseInteger(data.stockLimit ?? data["موجودی"] ?? "0") : undefined,
          isActive: parseActive(data.active ?? data.status ?? data["وضعیت"]),
          xrayLimitIp: isXray && (data.limitIp || data.xrayLimitIp) ? parseInteger(data.limitIp ?? data.xrayLimitIp ?? "0") : undefined,
          xrayGroupName: isXray && (data.group !== undefined || data.xrayGroupName !== undefined) ? ((data.group ?? data.xrayGroupName)?.trim() || null) : undefined,
        });
      }
      const product = await AdminService.updateProduct(productId, patch, String(ctx.from?.id ?? "admin"));
      return { done: true, text: "✅ محصول به‌روزرسانی شد.", returnTo: { id: "admin.product", params: { productId: product.id } } };
    },
  },

  free_test_config: {
    firstStep: "value",
    prompt: async (ctx) => {
      const field = String(ctx.session.flow?.data.field ?? "");
      if (field === "trafficGB") return "📊 حجم تست را به گیگابایت وارد کنید:";
      if (field === "durationDays") return "📅 مدت اکانت تست را به روز وارد کنید:";
      if (field === "stockLimit") return "📦 موجودی کل اکانت تست را وارد کنید:";
      if (field === "limitIp") return "🌐 محدودیت IP اکانت تست را وارد کنید:\n0 = نامحدود";
      return "⚠️ فیلد تنظیمات معتبر نیست.";
    },
    async handleText(ctx, text) {
      const field = String(ctx.session.flow?.data.field ?? "");
      const value = parseInteger(text);
      if (!Number.isInteger(value) || (field === "limitIp" ? value < 0 : value <= 0)) return { text: field === "limitIp" ? "عدد صفر یا بزرگ‌تر وارد کنید:" : "یک عدد مثبت وارد کنید:" };
      const patch = field === "trafficGB" ? { trafficGB: value } : field === "durationDays" ? { durationDays: value } : field === "stockLimit" ? { stockLimit: value } : field === "limitIp" ? { limitIp: value } : undefined;
      if (!patch) return { done: true, text: "⚠️ فیلد تنظیمات معتبر نیست.", returnTo: { id: "admin.freeAccounts" } };
      await FreeAccountService.updateXrayConfig(patch, String(ctx.from?.id ?? "admin"));
      return { done: true, text: "✅ تنظیمات اکانت تست ذخیره شد.", returnTo: { id: "admin.freeAccounts" } };
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


  product_guide_create: {
    firstStep: "title",
    prompt: "📘 عنوان بخش راهنما را وارد کنید:\n\nمثال: سرویس‌ها چطور کار می‌کنند؟",
    async handleText(ctx, text) {
      const flow = ctx.session.flow!;
      if (flow.step === "title") { flow.data.title = text.trim(); flow.step = "shortDescription"; return { text: "توضیح کوتاه این کارت را وارد کنید:", nextStep: "shortDescription" }; }
      if (flow.step === "shortDescription") { flow.data.shortDescription = text.trim(); flow.step = "body"; return { text: "متن اصلی کوتاه و تمیز را وارد کنید:", nextStep: "body" }; }
      if (flow.step === "body") { flow.data.body = text.trim(); flow.step = "icon"; return { text: "آیکن را وارد کنید (مثلاً 📘 یا 🔹):", nextStep: "icon" }; }
      if (flow.step === "icon") { flow.data.icon = text.trim() || "📘"; flow.step = "displayOrder"; return { text: "ترتیب نمایش را به عدد وارد کنید:", nextStep: "displayOrder" }; }
      const order = parseInteger(text);
      try {
        await ProductGuideService.save({ title: String(flow.data.title), shortDescription: String(flow.data.shortDescription), body: String(flow.data.body), icon: String(flow.data.icon ?? "📘"), displayOrder: Number.isFinite(order) ? order : 0, isActive: true }, String(ctx.from?.id ?? "admin"));
        return { done: true, text: "✅ بخش راهنمای محصولات ذخیره شد.", returnTo: { id: "admin.productGuides" } };
      } catch (error) { return { text: error instanceof Error ? `⚠️ ${error.message}` : "⚠️ ذخیره راهنما ناموفق بود." }; }
    },
  },
  product_guide_edit: {
    firstStep: "title",
    prompt: "📘 اطلاعات جدید راهنما را مرحله‌ای وارد کنید. ابتدا عنوان جدید را بفرستید:",
    async handleText(ctx, text) {
      const flow = ctx.session.flow!;
      if (flow.step === "title") { flow.data.title = text.trim(); flow.step = "shortDescription"; return { text: "توضیح کوتاه جدید:", nextStep: "shortDescription" }; }
      if (flow.step === "shortDescription") { flow.data.shortDescription = text.trim(); flow.step = "body"; return { text: "متن اصلی جدید:", nextStep: "body" }; }
      if (flow.step === "body") { flow.data.body = text.trim(); flow.step = "icon"; return { text: "آیکن جدید:", nextStep: "icon" }; }
      if (flow.step === "icon") { flow.data.icon = text.trim() || "📘"; flow.step = "displayOrder"; return { text: "ترتیب نمایش جدید:", nextStep: "displayOrder" }; }
      const order = parseInteger(text);
      try {
        await ProductGuideService.save({ title: String(flow.data.title), shortDescription: String(flow.data.shortDescription), body: String(flow.data.body), icon: String(flow.data.icon ?? "📘"), displayOrder: Number.isFinite(order) ? order : 0, isActive: true }, String(ctx.from?.id ?? "admin"), String(flow.data.sectionId));
        return { done: true, text: "✅ بخش راهنما ویرایش شد.", returnTo: { id: "admin.productGuides" } };
      } catch (error) { return { text: error instanceof Error ? `⚠️ ${error.message}` : "⚠️ ویرایش راهنما ناموفق بود." }; }
    },
  },

  payment_gateway_update: {
    firstStep: "fields",
    prompt: (ctx) => {
      const field = String(ctx.session.flow?.data.field ?? "");
      const prompts: Record<string, string> = {
        apiBaseUrl: "🌐 API URL جدید را وارد کنید:\n\nمثال: http://136.244.104.77:5000/api/v1",
        apiKey: "🔑 API KEY جدید را وارد کنید:\n\nفقط API Key اعتبارسنجی و ذخیره می‌شود؛ Callback بررسی نخواهد شد.",
        callbackUrl: "🔗 Callback URL جدید را وارد کنید:\n\nمثال: https://domain.com/payments/callback\n\nفقط Callback اعتبارسنجی و ذخیره می‌شود؛ API Key بررسی نخواهد شد.",
        gatewayName: "🏷 نام نمایشی درگاه را وارد کنید:\n\nمثال: پرداخت آنی",
        displayOrder: "🔢 ترتیب نمایش را به عدد وارد کنید:\n\nمثال: 1",
      };
      return prompts[field] ?? "⚡ فیلد تنظیمات درگاه معتبر نیست.";
    },
    async handleText(ctx, text) {
      const field = String(ctx.session.flow?.data.field ?? "") as keyof PaymentGatewayInput;
      const allowed: (keyof PaymentGatewayInput)[] = ["apiBaseUrl", "apiKey", "callbackUrl", "gatewayName", "displayOrder"];
      if (!allowed.includes(field)) return { done: true, text: "❌ فیلد تنظیمات درگاه معتبر نیست", returnTo: { id: "admin.paymentGateway" } };
      try {
        const value = field === "displayOrder" ? parseInteger(text) : text;
        const config = await PaymentGatewayService.updateConfigField(field, value as never, String(ctx.from?.id ?? "admin"));
        return { done: true, text: paymentGatewaySavedMessage(field, config), returnTo: { id: "admin.paymentGateway" } };
      } catch (error) {
        return { text: error instanceof Error ? `❌ ${error.message}\n\nدوباره مقدار معتبر را ارسال کنید:` : "❌ ذخیره تنظیمات ناموفق بود" };
      }
    },
  },

  payment_gateway_setup: {
    firstStep: "apiBaseUrl",
    prompt: "⚙️ راه‌اندازی مرحله‌ای درگاه\n\nمرحله 1 از 4:\nAPI URL را وارد کنید:\n\nمثال: http://136.244.104.77:5000/api/v1",
    async handleText(ctx, text) {
      const flow = ctx.session.flow!;
      try {
        if (flow.step === "apiBaseUrl") {
          const apiBaseUrl = String(PaymentGatewayService.validateConfigField("apiBaseUrl", text));
          flow.data.apiBaseUrl = apiBaseUrl;
          flow.step = "apiKey";
          return { text: `✅ API URL معتبر است\n\nمرحله 2 از 4:\nAPI KEY را وارد کنید:`, nextStep: "apiKey" };
        }
        if (flow.step === "apiKey") {
          const apiKey = String(PaymentGatewayService.validateConfigField("apiKey", text));
          flow.data.apiKey = apiKey;
          flow.step = "callbackUrl";
          return { text: `✅ API Key معتبر است\n\nمرحله 3 از 4:\nCALLBACK URL را وارد کنید:`, nextStep: "callbackUrl" };
        }
        if (flow.step === "callbackUrl") {
          const callbackUrl = String(PaymentGatewayService.validateConfigField("callbackUrl", text));
          flow.data.callbackUrl = callbackUrl;
          flow.data.gatewayName = "پرداخت آنی";
          flow.step = "confirm";
          return {
            text: `مرحله 4 از 4: تأیید نهایی\n\nAPI URL:\n${flow.data.apiBaseUrl}\n\nAPI Key:\n********${String(flow.data.apiKey).slice(-4).toUpperCase()}\n\nCallback:\n${flow.data.callbackUrl}\n\nپس از تأیید، تنظیمات یک‌جا ذخیره و تست اتصال اجرا می‌شود.\nبرای ادامه روی دکمه تأیید بزنید.`,
            nextStep: "confirm",
            keyboard: [[{ text: "✅ تأیید و تست اتصال", action: actionFor("payment_gateway_setup:confirm") }]],
          };
        }
        if (flow.step === "confirm") return { text: "برای ادامه روی دکمه تأیید بزنید." };
      } catch (error) {
        return { text: error instanceof Error ? `❌ ${error.message}\n\nهمان مرحله را با مقدار معتبر دوباره ارسال کنید:` : "❌ ذخیره مرحله ناموفق بود" };
      }
      return { text: "⚠️ مرحله نامعتبر است." };
    },
  },
  xray_panel_setup: {
    firstStep: "fields",
    prompt: (ctx) => {
      const field = String(ctx.session.flow?.data.field ?? "");
      if (field === "apiBaseUrl") return `🌐 آدرس پنل Xray را وارد کنید:

مثال: https://domain.com:port/securityPath`;
      if (field === "apiToken") return "🔑 توکن API پنل Xray را وارد کنید:";
      if (field === "subscriptionBaseUrl") return `🔗 لینک پایه اشتراک را وارد کنید (اختیاری):

مثال: https://domain.com:2096/sub/`;
      return `⚙️ تنظیمات پنل Xray را به شکل key:value ارسال کنید.

apiBaseUrl: https://panel.example.com
apiToken: TOKEN
subscriptionBaseUrl: https://sub.example.com
enabled: true

توکن کامل در پنل نمایش داده نمی‌شود.`;
    },
    async handleText(ctx, text) {
      try {
        const flow = ctx.session.flow!;
        const field = String(flow.data.field ?? "");
        const data = field ? { [field]: text.trim() } : parseKeyValueLines(text);
        const patch: XrayPanelConfigPatch = {};
        if (data.apiBaseUrl !== undefined) patch.apiBaseUrl = data.apiBaseUrl;
        if (data.apiToken !== undefined) patch.apiToken = data.apiToken;
        if (data.subscriptionBaseUrl !== undefined) patch.subscriptionBaseUrl = data.subscriptionBaseUrl;
        if (data.enabled !== undefined) {
          const enabled = parseActive(data.enabled);
          if (enabled === undefined) return { text: "مقدار وضعیت معتبر نیست. از true/false یا فعال/غیرفعال استفاده کنید." };
          patch.enabled = enabled;
        }
        if (!Object.keys(patch).length) return { text: "هیچ مقدار معتبری برای ذخیره ارسال نشده است." };
        await XrayPanelService.upsertConfigPatch(patch);
        return { done: true, text: "✅ تنظیمات پنل Xray ذخیره شد. برای اطمینان تست اتصال را اجرا کنید.", returnTo: { id: "admin.xraySettings" } };
      } catch (error) {
        return { text: error instanceof Error ? `❌ ${error.message}` : "❌ ذخیره تنظیمات پنل ناموفق بود." };
      }
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
  await flowPrompt(ctx, typeof definition.prompt === "function" ? await definition.prompt(ctx) : definition.prompt, definition.initialKeyboard ? await definition.initialKeyboard(ctx) : []);
}

export async function handleActiveFlowText(ctx: AppContext, text: string) {
  const flow = ctx.session.flow;
  if (!flow) return false;
  const result = await definitions[flow.name].handleText?.(ctx, text);
  if (!result) return false;
  if (result.done) {
    ctx.session.flow = undefined;
    await ctx.reply(result.text, flow.name === "instant_topup" ? { reply_markup: { inline_keyboard: [[{ text: "💳 پرداخت", url: String(result.text.match(/https?:\/\/\S+/)?.[0] ?? "") }], [{ text: "🔄 بررسی وضعیت", callback_data: callbackFor("wallet.history") }, { text: "🎫 پشتیبانی", callback_data: callbackFor("support") }], [{ text: "🏠 خانه", callback_data: callbackFor("home") }]] } } : undefined);
    await renderPanel(ctx, result.returnTo ?? flow.returnTo ?? { id: "home" }, "replace", RenderMode.SEND_NEW);
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
    await renderPanel(ctx, result.returnTo ?? flow.returnTo ?? { id: "home" }, "replace", RenderMode.SEND_NEW);
    return true;
  }
  await flowPrompt(ctx, result.text, result.keyboard);
  return true;
}

export function registerFlowEngine(bot: AppBot) {
  bot.action(/^flow:product_category:([^:]+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const flow = ctx.session.flow;
    if (!flow || (flow.name !== "product_create" && flow.name !== "product_edit")) {
      await ctx.answerCbQuery("عملیات فعالی وجود ندارد");
      return;
    }
    try {
      const categories = await ProductService.listSelectableCategoriesForAdmin(100);
      const category = categories.find((item) => item.id === ctx.match[1]);
      if (!category) {
        await flowPrompt(ctx, "⚠️ دسته‌بندی نامعتبر یا حذف‌شده است. لطفاً دوباره انتخاب کنید.", await productCategoryKeyboard());
        return;
      }
      if (flow.name === "product_create") {
        flow.data.categoryId = category.id;
        flow.step = "title";
        await flowPrompt(ctx, `✅ دسته‌بندی انتخاب شد: ${category.name}\n\nنام محصول را وارد کنید:`);
        return;
      }
      flow.data.categoryId = category.id;
      await flowPrompt(ctx, `✅ دسته‌بندی انتخاب شد: ${category.name}\n\nحالا سایر فیلدهای محصول را ارسال کنید یا فقط برای تغییر دسته‌بندی بنویسید: ذخیره`);
    } catch {
      await flowPrompt(ctx, "⚠️ دسته‌بندی نامعتبر یا حذف‌شده است. لطفاً دوباره انتخاب کنید.", await productCategoryKeyboard());
    }
  });


  bot.action(/^flow:back:([^:]+):?([^:]*)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const flow = ctx.session.flow;
    if (!flow) return renderPanel(ctx, currentReturnTo(ctx), "replace", RenderMode.EDIT_CURRENT);
    const target = ctx.match[1];
    const step = ctx.match[2];
    if (target === "deposit") {
      flow.step = step || "amount";
      delete flow.data.depositId;
      await flowPrompt(ctx, "💳 مبلغ شارژ را به تومان وارد کنید:\n\nفقط عدد را ارسال کنید؛ مثال: 250000");
      return;
    }
    if (target === "product" && (flow.name === "product_create" || flow.name === "product_edit")) {
      flow.step = step || "category";
      await flowPrompt(ctx, "📂 دسته‌بندی محصول را دوباره انتخاب کنید:", await productCategoryKeyboard());
      return;
    }
    await renderPanel(ctx, flow.returnTo ?? { id: "home" }, "replace", RenderMode.EDIT_CURRENT);
  });

  bot.action("flow:cancel", async (ctx) => {
    ctx.session.flow = undefined;
    await ctx.answerCbQuery("لغو شد");
    await renderPanel(ctx, currentReturnTo(ctx), "replace");
  });

  bot.action("payment_gateway_setup:confirm", async (ctx) => {
    await ctx.answerCbQuery("در حال ذخیره و تست اتصال...");
    const flow = ctx.session.flow;
    if (!flow || flow.name !== "payment_gateway_setup" || flow.step !== "confirm") {
      await ctx.answerCbQuery("راه‌اندازی فعالی وجود ندارد");
      return;
    }
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) {
      await ctx.answerCbQuery("دسترسی غیرمجاز");
      return;
    }
    try {
      await completePaymentGatewaySetup(ctx);
    } catch (error) {
      await ctx.reply(error instanceof Error ? `❌ ${error.message}` : "❌ ذخیره نهایی یا تست اتصال ناموفق بود");
    }
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
const adminOnlyFlows: FlowName[] = [
  "product_create",
  "product_edit",
  "account_create",
  "account_edit",
  "coupon_create",
  "coupon_edit",
  "category_create",
  "category_edit",
  "product_price",
  "crypto_wallet_create",
  "crypto_wallet_edit",
  "minimum_topup",
  "referral_tier_create",
  "store_status",
  "forced_join_create",
  "product_guide_create",
  "product_guide_edit",
  "wallet_adjust",
  "broadcast_create",
  "payment_gateway_update",
  "payment_gateway_setup",
  "xray_panel_setup",
  "free_account_create",
  "free_account_edit",
  "free_test_config",
];
    if (adminOnlyFlows.includes(name) && (!ctx.from || !(await isAdminByTelegramId(ctx.from.id)))) {
      await ctx.answerCbQuery("دسترسی غیرمجاز");
      return;
    }
    if (name === "product_guide_edit") return startFlow(ctx, "product_guide_edit", { sectionId: ctx.match[2] });
    if (name === "payment_gateway_update") return startFlow(ctx, "payment_gateway_update", { field: ctx.match[2] });
    if (name === "payment_gateway_setup") return startFlow(ctx, "payment_gateway_setup");
    if (name === "xray_panel_setup") return startFlow(ctx, "xray_panel_setup", { field: ctx.match[2] });
    if (name === "coupon_edit") return startFlow(ctx, "coupon_edit", { couponId: ctx.match[2] });
if (name === "broadcast_create") {
  return startFlow(ctx, "broadcast_create", {
    target: ctx.match[2],
  });
}
    if (name === "category_edit") return startFlow(ctx, "category_edit", { categoryId: ctx.match[2] });
    if (name === "product_edit") return startFlow(ctx, "product_edit", { productId: ctx.match[2], field: ctx.match[3] });
    if (name === "free_test_config") return startFlow(ctx, "free_test_config", { field: ctx.match[2] });
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
