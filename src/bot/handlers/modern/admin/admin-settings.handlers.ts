import type { AppBot, AppContext } from "../../../../types/bot";
import { registerModernViews } from "../../../views/modern.views";
import { goBack, parseNavAction, renderPanel, callbackFor, actionFor, RenderMode } from "../../../navigation/panel-ui";
import { createCallbackToken, resolveCallbackToken, tokenAction } from "../../../navigation/callback-tokens";
import { registerFlowEngine, handleActiveFlowPhoto, handleActiveFlowText, startFlow } from "../../../flows/flow-engine";
import { UserService } from "../../../../modules/user/user.service";
import { ReferralService } from "../../../../modules/referral/referral.service";
import { PurchaseService } from "../../../../modules/product/purchase.service";
import { ProductService } from "../../../../modules/product/product.service";
import { CryptoWalletService, DepositService } from "../../../../modules/deposit/deposit.service";
import { AdminService } from "../../../../modules/admin/admin.service";
import { CouponService } from "../../../../modules/coupon/coupon.service";
import { SupportService } from "../../../../modules/support/support.service";
import {
  FreeAccountError,
  FreeAccountService,
  FREE_ACCOUNT_STATUS_LABELS,
  formatFreeAccountError,
  formatFreeAccountDate,
  freeAccountExpiresAt,
} from "../../../../modules/free-account/free-account.service";
import { PaymentGatewayService, PaymentInvoiceService } from "../../../../modules/payment/payment.service";
import { isAdminByTelegramId } from "../../../middlewares/admin.middleware";
import { quickReplyTarget } from "../../../keyboards/reply.keyboard";
import { InvoiceActionKeyboard } from "../../../keyboards/design-system";
import { supportCloseHomeInlineKeyboard } from "../../../keyboards/common.keyboard";
import { xraySubscriptionKeyboard, xrayConfigsSentKeyboard, xrayRenewedKeyboard, xrayRenewalInvoiceKeyboard } from "../../../keyboards/account.keyboard";
import { accountHomeInlineKeyboard, expiredCheckoutRecoveryKeyboard, pendingInvoiceRecoveryKeyboard, processingPurchaseRecoveryKeyboard, standardPurchaseDeliveryKeyboard, xrayPurchaseDeliveryKeyboard } from "../../../keyboards/purchase.keyboard";
import { buyCallbacks, nav, xrayCallbacks } from "../../../callbacks";
import { pendingInvoiceExistsMessage, previousPurchaseProcessingMessage, unauthorizedMessage } from "../../../messages/purchase.messages";
import { serviceNotFoundMessage, xrayConfigsSentMessage, xrayRenewalInvoiceMessage, xrayRenewedMessage, xraySubscriptionMessage } from "../../../messages/account.messages";
import { adminOnlyCommandMessage, publicPlansDisabledInGroupsMessage } from "../../../messages/common.messages";
import { couponApplyFromProductMessage, couponRemovedMessage } from "../../../messages/coupon.messages";
import { purchaseSuccessMessage } from "../../../../utils/messages";
import { MonitoringService } from "../../../../services/monitoring.service";
import { ProductGuideService } from "../../../../modules/system/product-guide.service";
import { PublicPlansService } from "../../../../modules/product/public-plans.service";
import { XrayClientService, XrayPanelService, xrayInboundSnapshot } from "../../../../modules/xray/xray.service";
import { prisma } from "../../../../services/prisma";

export function registerAdminSettingsHandlers(bot: AppBot) {
  bot.action(/^admin:xray:enabled:(0|1)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return;
    const config = await prisma.xrayPanelConfig.findFirst({ orderBy: { updatedAt: "desc" } });
    if (!config) return void (await ctx.reply("ابتدا تنظیمات پنل Xray را ثبت کنید."));
    await prisma.xrayPanelConfig.update({ where: { id: config.id }, data: { enabled: ctx.match[1] === "1" } });
    await renderPanel(ctx, { id: "admin.xraySettings" }, "replace");
  });

  bot.action(/^admin:product_guide:status:([^:]+):([01])$/, async (ctx) => {
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return ctx.answerCbQuery("دسترسی غیرمجاز");
    await ctx.answerCbQuery("وضعیت راهنما ذخیره شد");
    await ProductGuideService.setActive(ctx.match[1], ctx.match[2] === "1", String(ctx.from.id));
    await renderPanel(ctx, { id: "admin.productGuides" }, "replace");
  });

  bot.action(/^admin:product_guide:delete:([^:]+)$/, async (ctx) => {
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return ctx.answerCbQuery("دسترسی غیرمجاز");
    await ctx.answerCbQuery("حذف شد");
    await ProductGuideService.delete(ctx.match[1], String(ctx.from.id));
    await renderPanel(ctx, { id: "admin.productGuides" }, "replace");
  });

  bot.action(/^admin:public_plans:(enabled|disabled)$/, async (ctx) => {
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return ctx.answerCbQuery("دسترسی غیرمجاز");
    await ctx.answerCbQuery("تنظیمات ذخیره شد");
    await PublicPlansService.setEnabled(ctx.match[1] === "enabled", String(ctx.from.id));
    await renderPanel(ctx, { id: "admin.productGuides" }, "replace");
  });

  bot.action(/^admin:payment_gateway:status:(enabled|disabled)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return void (await ctx.answerCbQuery("دسترسی غیرمجاز"));
    try {
      await PaymentGatewayService.setEnabled(ctx.match[1] === "enabled", String(ctx.from.id));
      await renderPanel(ctx, { id: "admin.paymentGateway" }, "replace");
    } catch (error) {
      await ctx.reply(`❌ ${error instanceof Error ? error.message : "تغییر وضعیت درگاه ناموفق بود"}`);
    }
  });

  bot.action("admin:payment_gateway:test", async (ctx) => {
    await ctx.answerCbQuery("در حال تست اتصال...");
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return void (await ctx.answerCbQuery("دسترسی غیرمجاز"));
    const result = await PaymentGatewayService.testConnection(String(ctx.from.id));
    await ctx.reply(`${result.message}

جزئیات:
${result.ok ? JSON.stringify(result.details) : result.error}`);
    await renderPanel(ctx, { id: "admin.paymentGateway" }, "replace");
  });

  bot.action(/^admin:store:status:(active|inactive)$/, async (ctx) => {
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return ctx.answerCbQuery("دسترسی غیرمجاز");
    await ctx.answerCbQuery();
    await AdminService.setStoreStatus(ctx.match[1] as "active" | "inactive", String(ctx.from.id));
    await renderPanel(ctx, { id: "admin.store" }, "replace");
  });

  bot.action(/^admin:forced_join:status:([^:]+):(active|inactive)$/, async (ctx) => {
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return ctx.answerCbQuery("دسترسی غیرمجاز");
    await ctx.answerCbQuery();
    await AdminService.setForcedJoinStatus(ctx.match[1], ctx.match[2] as "active" | "inactive", String(ctx.from.id));
    await renderPanel(ctx, { id: "admin.forcedJoin" }, "replace");
  });

  bot.action(/^admin:forced_join:delete:([^:]+)$/, async (ctx) => {
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return ctx.answerCbQuery("دسترسی غیرمجاز");
    await ctx.answerCbQuery();
    await AdminService.deleteForcedJoinChannel(ctx.match[1], String(ctx.from.id));
    await renderPanel(ctx, { id: "admin.forcedJoin" }, "replace");
  });

  bot.action(/^admin:referral:tier:status:([^:]+):([01])$/, async (ctx) => {
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return ctx.answerCbQuery("دسترسی غیرمجاز");
    await ctx.answerCbQuery();
    await ReferralService.setTierStatus(ctx.match[1], ctx.match[2] === "1", String(ctx.from.id));
    await renderPanel(ctx, { id: "admin.referrals" }, "replace");
  });

  bot.action(/^admin:referral:tier:delete:([^:]+)$/, async (ctx) => {
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return ctx.answerCbQuery("دسترسی غیرمجاز");
    await ctx.answerCbQuery();
    await ReferralService.deleteTier(ctx.match[1], String(ctx.from.id));
    await renderPanel(ctx, { id: "admin.referrals" }, "replace");
  });
}
