import type { AppBot, AppContext } from "../../../types/bot";
import { registerModernViews } from "../../views/modern.views";
import { goBack, parseNavAction, renderPanel, callbackFor, actionFor, RenderMode } from "../../navigation/panel-ui";
import { createCallbackToken, resolveCallbackToken, tokenAction } from "../../navigation/callback-tokens";
import { registerFlowEngine, handleActiveFlowPhoto, handleActiveFlowText, startFlow } from "../../flows/flow-engine";
import { UserService } from "../../../modules/user/user.service";
import { ReferralService } from "../../../modules/referral/referral.service";
import { PurchaseService } from "../../../modules/product/purchase.service";
import { ProductService } from "../../../modules/product/product.service";
import { CryptoWalletService, DepositService } from "../../../modules/deposit/deposit.service";
import { AdminService } from "../../../modules/admin/admin.service";
import { CouponService } from "../../../modules/coupon/coupon.service";
import { SupportService } from "../../../modules/support/support.service";
import {
  FreeAccountError,
  FreeAccountService,
  FREE_ACCOUNT_STATUS_LABELS,
  formatFreeAccountError,
  formatFreeAccountDate,
  freeAccountExpiresAt,
} from "../../../modules/free-account/free-account.service";
import { PaymentGatewayService, PaymentInvoiceService } from "../../../modules/payment/payment.service";
import { isAdminByTelegramId } from "../../middlewares/admin.middleware";
import { quickReplyTarget } from "../../keyboards/reply.keyboard";
import { InvoiceActionKeyboard } from "../../keyboards/design-system";
import { supportCloseHomeInlineKeyboard } from "../../keyboards/common.keyboard";
import { xraySubscriptionKeyboard, xrayConfigsSentKeyboard, xrayRenewedKeyboard, xrayRenewalInvoiceKeyboard } from "../../keyboards/account.keyboard";
import { accountHomeInlineKeyboard, expiredCheckoutRecoveryKeyboard, pendingInvoiceRecoveryKeyboard, processingPurchaseRecoveryKeyboard, standardPurchaseDeliveryKeyboard, xrayPurchaseDeliveryKeyboard } from "../../keyboards/purchase.keyboard";
import { buyCallbacks, nav, xrayCallbacks } from "../../callbacks";
import { pendingInvoiceExistsMessage, previousPurchaseProcessingMessage, unauthorizedMessage } from "../../messages/purchase.messages";
import { serviceNotFoundMessage, xrayConfigsSentMessage, xrayRenewalInvoiceMessage, xrayRenewedMessage, xraySubscriptionMessage } from "../../messages/account.messages";
import { adminOnlyCommandMessage, publicPlansDisabledInGroupsMessage } from "../../messages/common.messages";
import { couponApplyFromProductMessage, couponRemovedMessage } from "../../messages/coupon.messages";
import { purchaseSuccessMessage } from "../../../utils/messages";
import { MonitoringService } from "../../../services/monitoring.service";
import { ProductGuideService } from "../../../modules/system/product-guide.service";
import { PublicPlansService } from "../../../modules/product/public-plans.service";
import { XrayClientService, XrayPanelService, xrayInboundSnapshot } from "../../../modules/xray/xray.service";
import { prisma } from "../../../services/prisma";


export function registerXrayHandlers(bot: AppBot) {
  async function ownedXrayClient(ctx: AppContext, id: string) {
    if (!ctx.from) return null;
    const user = await UserService.getByTelegramId(ctx.from.id);
    if (!user) return null;
    return prisma.xrayClient.findFirst({ where: { id, userId: user.id }, include: { product: true } });
  }

  bot.action(/^xray:sub:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const client = await ownedXrayClient(ctx, ctx.match[1]);
    if (!client) return void (await ctx.reply(serviceNotFoundMessage()));
    try {
      const url = await XrayClientService.subscriptionUrl(client);
      await XrayClientService.subLinks(client.clientSubId!).catch(() => null);
      await ctx.reply(xraySubscriptionMessage(url), { reply_markup: xraySubscriptionKeyboard(client.id) });
    } catch (error) {
      await ctx.reply(`⚠️ لینک اشتراک در دسترس نیست\n\n${error instanceof Error ? error.message : "خطای نامشخص"}`);
    }
  });

  bot.action(/^xray:qr:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const client = await ownedXrayClient(ctx, ctx.match[1]);
    if (!client) return void (await ctx.reply(serviceNotFoundMessage()));
    try {
      const url = await XrayClientService.subscriptionUrl(client);
      const qr = `https://api.qrserver.com/v1/create-qr-code/?size=512x512&data=${encodeURIComponent(url)}`;
      await ctx.replyWithPhoto(qr, { caption: "📲 QR لینک اشتراک\n\nبا اسکن این کد، لینک اشتراک شما در برنامه قابل افزودن است." });
    } catch (error) {
      await ctx.reply(`⚠️ ساخت QR ناموفق بود\n\n${error instanceof Error ? error.message : "خطای نامشخص"}`);
    }
  });

  bot.action(/^xray:configs:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery("در حال دریافت کانفیگ‌ها...");
    const client = await ownedXrayClient(ctx, ctx.match[1]);
    if (!client) return void (await ctx.reply(serviceNotFoundMessage()));
    try {
      const raw = await XrayClientService.links(client.clientEmail);
      const configs = Array.isArray(raw)
        ? raw
        : typeof raw === "string"
          ? raw.split(/\r?\n/).filter(Boolean)
          : Object.values(raw ?? {})
              .flat()
              .map(String);
      if (!configs.length) return void (await ctx.reply("⚠️ کانفیگی از پنل دریافت نشد."));
      for (let i = 0; i < configs.length; i++) await ctx.reply(`⚙️ کانفیگ ${i + 1}\n\n${configs[i]}`);
      await ctx.reply(xrayConfigsSentMessage(configs.length), { reply_markup: xrayConfigsSentKeyboard(client.id) });
    } catch (error) {
      await ctx.reply(`⚠️ دریافت کانفیگ‌ها ناموفق بود\n\n${error instanceof Error ? error.message : "خطای نامشخص"}`);
    }
  });

  async function renewWithWallet(ctx: AppContext, xrayClientId: string, productId: string) {
    if (!ctx.from) return;
    const user = await UserService.getByTelegramId(ctx.from.id);
    if (!user) return;
    try {
      await ctx.editMessageText("⏳ در حال تمدید سرویس از کیف پول...", { reply_markup: { inline_keyboard: [] } });
      const renewal = await PaymentInvoiceService.renewXrayWithWallet(user.id, xrayClientId, productId);
      await ctx.reply(xrayRenewedMessage(renewal.newExpiry), { reply_markup: xrayRenewedKeyboard(xrayClientId) });
    } catch (error) {
      await ctx.reply(`⚠️ تمدید ناموفق بود\n\n${error instanceof Error ? error.message : "خطای نامشخص"}`);
    }
  }

  async function renewWithInstantInvoice(ctx: AppContext, xrayClientId: string, productId: string) {
    if (!ctx.from) return;
    const user = await UserService.getByTelegramId(ctx.from.id);
    if (!user) return;
    try {
      const invoice = await PaymentInvoiceService.createXrayRenewalInvoice(user.id, xrayClientId, productId);
      await ctx.reply(xrayRenewalInvoiceMessage(invoice.amount), { reply_markup: xrayRenewalInvoiceKeyboard(xrayClientId, invoice.paymentLink) });
    } catch (error) {
      await ctx.reply(`⚠️ ایجاد فاکتور تمدید ناموفق بود\n\n${error instanceof Error ? error.message : "خطای نامشخص"}`);
    }
  }

  bot.action(/^xr:r:s:([^:]+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const payload = resolveCallbackToken(ctx, "renewal", ctx.match[1]);
    if (!payload) return void (await ctx.reply("⚠️ این دکمه منقضی شده است. لطفاً لیست تمدید را دوباره باز کنید."));
    return renderPanel(ctx, { id: "account.renew.summary", params: payload }, "push", RenderMode.EDIT_CURRENT);
  });

  bot.action(/^xr:r:w:([^:]+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const payload = resolveCallbackToken(ctx, "renewal", ctx.match[1]);
    if (!payload) return void (await ctx.reply("⚠️ این دکمه منقضی شده است. لطفاً خلاصه تمدید را دوباره باز کنید."));
    return renewWithWallet(ctx, payload.xrayClientId, payload.productId);
  });

  bot.action(/^xr:r:i:([^:]+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const payload = resolveCallbackToken(ctx, "renewal", ctx.match[1]);
    if (!payload) return void (await ctx.reply("⚠️ این دکمه منقضی شده است. لطفاً خلاصه تمدید را دوباره باز کنید."));
    return renewWithInstantInvoice(ctx, payload.xrayClientId, payload.productId);
  });

  bot.action(/^xray:renew:wallet:([^:]+):([^:]+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    return renewWithWallet(ctx, ctx.match[1], ctx.match[2]);
  });

  bot.action(/^xray:renew:instant:([^:]+):([^:]+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    return renewWithInstantInvoice(ctx, ctx.match[1], ctx.match[2]);
  });
}
