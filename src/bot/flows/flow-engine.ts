import type { AppBot, AppContext, FlowName } from "../../types/bot";
import { renderPanel, callbackFor, panelKeyboard, type UiKeyboard, type ViewState } from "../navigation/panel-ui";
import { UserService } from "../../modules/user/user.service";
import { ProductService } from "../../modules/product/product.service";
import { CouponService } from "../../modules/coupon/coupon.service";
import { CryptoWalletService, DepositService, FinancialSettingsService } from "../../modules/deposit/deposit.service";
import { SupportService } from "../../modules/support/support.service";
import { AdminService } from "../../modules/admin/admin.service";
import { FreeAccountService } from "../../modules/free-account/free-account.service";
import { ReferralService } from "../../modules/referral/referral.service";

const money = (value: number) => `${value.toLocaleString("fa-IR")} تومان`;

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

const definitions: Record<FlowName, FlowDefinition> = {
  deposit_submit: {
    firstStep: "amount",
    prompt: async () => {
      const setting = await FinancialSettingsService.get();
      return `💳 مبلغ شارژ را به تومان وارد کنید:\n\nحداقل شارژ: ${money(setting.minimumTopupAmount)}`;
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
      return { done: true, text: "✅ رسید شما ثبت شد و پس از بررسی، کیف پول به‌روزرسانی می‌شود.", returnTo: { id: "wallet" } };
    },
  },
  ticket_reply: {
    firstStep: "message",
    prompt: "🎧 متن پیام پشتیبانی را وارد کنید:",
    async handleText(ctx, text) {
      const user = await requireUser(ctx);
      const ticketId = ctx.session.flow?.data.ticketId ? String(ctx.session.flow.data.ticketId) : (await SupportService.createTicket(user.id)).id;
      await SupportService.addUserMessage(ticketId, user.id, text.trim());
      return { done: true, text: "✅ پیام شما ثبت شد. پاسخ پشتیبانی در همین ربات ارسال می‌شود.", returnTo: { id: "support" } };
    },
  },
  coupon_code: {
    firstStep: "code",
    prompt: "🎟 کد تخفیف را وارد کنید:",
    async handleText(ctx, text) {
      const user = await requireUser(ctx);
      const productId = String(ctx.session.flow?.data.productId ?? "");
      await CouponService.validateForUser(text, user.id);
      ctx.session.selectedCoupons ??= {};
      ctx.session.selectedCoupons[productId] = text.trim().toUpperCase();
      return { done: true, text: "✅ کد تخفیف روی پیش‌فاکتور اعمال شد.", returnTo: { id: "shop.checkout", params: { productId } } };
    },
  },
  product_create: {
    firstStep: "category",
    prompt: "📦 نام دسته‌بندی محصول را وارد کنید:",
    async handleText(ctx, text) {
      const flow = ctx.session.flow!;
      if (flow.step === "category") { flow.data.categoryName = text.trim(); flow.step = "title"; return { text: "نام محصول را وارد کنید:", nextStep: "title" }; }
      if (flow.step === "title") { flow.data.title = text.trim(); flow.step = "price"; return { text: "قیمت محصول را به تومان وارد کنید:", nextStep: "price" }; }
      if (flow.step === "price") {
        const price = Number(text.replace(/[,،\s]/g, ""));
        if (!Number.isInteger(price) || price < 0) return { text: "قیمت معتبر نیست. دوباره وارد کنید:" };
        flow.data.price = price; flow.step = "duration"; return { text: "مدت سرویس را به روز وارد کنید:", nextStep: "duration" };
      }
      const duration = Number(text.replace(/[,،\s]/g, ""));
      if (!Number.isInteger(duration) || duration <= 0) return { text: "مدت معتبر نیست. دوباره وارد کنید:" };
      await ProductService.create({ categoryName: String(flow.data.categoryName), title: String(flow.data.title), price: Number(flow.data.price), duration });
      return { done: true, text: "✅ محصول جدید ثبت شد.", returnTo: { id: "admin.products" } };
    },
  },
  account_create: {
    firstStep: "username",
    prompt: "🔐 نام کاربری اکانت را وارد کنید:",
    async handleText(ctx, text) {
      const flow = ctx.session.flow!;
        if (flow.step === "username") { flow.data.username = text.trim(); flow.step = "subscriptionLink"; return { text: "لینک ساب اکانت را وارد کنید:", nextStep: "subscriptionLink" }; }
      if (flow.step === "subscriptionLink") { flow.data.subscriptionLink = text.trim(); flow.step = "configLink"; return { text: "لینک کانفیگ را وارد کنید:", nextStep: "configLink" }; }
      const productId = String(flow.data.productId);
      await ProductService.addAccount(productId, { username: String(flow.data.username), subscriptionLink: String(flow.data.subscriptionLink), configLink: text.trim() });
      return { done: true, text: "✅ اکانت به موجودی محصول اضافه شد.", returnTo: { id: "admin.product", params: { productId } } };
    },
  },
  free_account_create: {
    firstStep: "username",
    prompt: "🎁 نام کاربری اکانت رایگان را وارد کنید:",
    async handleText(ctx, text) {
      const flow = ctx.session.flow!;
      if (flow.step === "username") { flow.data.username = text.trim(); flow.step = "password"; return { text: "رمز عبور اکانت رایگان را وارد کنید:", nextStep: "password" }; }
      if (flow.step === "password") { flow.data.password = text.trim(); flow.step = "config"; return { text: "کانفیگ اکانت رایگان را وارد کنید:", nextStep: "config" }; }
      await FreeAccountService.addToPool(String(flow.data.productId), { username: String(flow.data.username), password: String(flow.data.password), config: text.trim() });
      return { done: true, text: "✅ اکانت به استخر رایگان اضافه شد.", returnTo: { id: "admin.freeAccounts" } };
    },
  },
  coupon_create: {
    firstStep: "code",
    prompt: "🎟 کد کوپن را وارد کنید:",
    async handleText(ctx, text) {
      const flow = ctx.session.flow!;
      if (flow.step === "code") { flow.data.code = text.trim(); flow.step = "percent"; return { text: "درصد تخفیف را وارد کنید:", nextStep: "percent" }; }
      if (flow.step === "percent") { const percent = Number(text); if (!Number.isInteger(percent) || percent < 1 || percent > 100) return { text: "درصد معتبر نیست:" }; flow.data.percent = percent; flow.step = "maxUses"; return { text: "حداکثر تعداد استفاده را وارد کنید:", nextStep: "maxUses" }; }
      if (flow.step === "maxUses") { const maxUses = Number(text); if (!Number.isInteger(maxUses) || maxUses <= 0) return { text: "تعداد معتبر نیست:" }; flow.data.maxUses = maxUses; flow.step = "days"; return { text: "اعتبار کوپن چند روز باشد؟", nextStep: "days" }; }
      const days = Number(text); if (!Number.isInteger(days) || days <= 0) return { text: "تعداد روز معتبر نیست:" };
      await CouponService.create(String(flow.data.code), Number(flow.data.percent), new Date(Date.now() + days * 86_400_000), Number(flow.data.maxUses));
      return { done: true, text: "✅ کوپن جدید ساخته شد.", returnTo: { id: "admin.coupons" } };
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
      if (flow.step === "coin") { flow.data.coinName = text.trim().toUpperCase(); flow.step = "network"; return { text: "🌐 نام شبکه را وارد کنید (مثلا TRC20):", nextStep: "network" }; }
      if (flow.step === "network") { flow.data.networkName = text.trim(); flow.step = "address"; return { text: "🏦 آدرس کیف پول را وارد کنید:", nextStep: "address" }; }
      if (flow.step === "address") { flow.data.walletAddress = text.trim(); flow.step = "status"; return { text: "وضعیت کیف پول را وارد کنید (فعال / غیرفعال):", nextStep: "status" }; }
      const status = text.includes("غیر") || text.toLowerCase() === "inactive" ? "inactive" : "active";
      await AdminService.saveCryptoWallet({ coinName: String(flow.data.coinName), networkName: String(flow.data.networkName), walletAddress: String(flow.data.walletAddress), status }, String(ctx.from?.id ?? "admin"));
      return { done: true, text: "✅ کیف پول رمز ارزی ذخیره شد. نرخ به‌صورت خودکار دریافت می‌شود.", returnTo: { id: "admin.crypto" } };
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
        flow.data.threshold = threshold; flow.step = "amount"; return { text: "مبلغ پاداش را به تومان وارد کنید:", nextStep: "amount" };
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

  bot.action(/^flow:start:([^:]+)(?::([^:]+))?(?::([^:]+))?$/, async (ctx) => {
    await ctx.answerCbQuery();
    const name = ctx.match[1];
    if (!isFlowName(name)) {
      await ctx.answerCbQuery("جریان نامعتبر است");
      return;
    }
    if (name === "coupon_code") return startFlow(ctx, "coupon_code", { productId: ctx.match[2] });
    if (name === "account_create") return startFlow(ctx, "account_create", { productId: ctx.match[2] });
    if (name === "free_account_create") return startFlow(ctx, "free_account_create", { productId: ctx.match[2] });
    if (name === "ticket_reply") return startFlow(ctx, "ticket_reply", { ticketId: ctx.match[2] });
    if (name === "wallet_adjust") return startFlow(ctx, "wallet_adjust", { userId: ctx.match[2], mode: ctx.match[3] });
    if (name === "product_price") return startFlow(ctx, "product_price", { productId: ctx.match[2] });
    return startFlow(ctx, name);
  });
}
