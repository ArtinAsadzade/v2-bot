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


export function registerFreeAccountHandlers(bot: AppBot) {
  bot.action("free_config", async (ctx) => {
    await ctx.answerCbQuery("این بخش به اکانت تست منتقل شد");
    await renderPanel(ctx, { id: "freeAccount" }, "replace");
  });

  bot.action("free_config:claim", async (ctx) => {
    await ctx.answerCbQuery("برای دریافت از اکانت تست استفاده کنید");
    await renderPanel(ctx, { id: "freeAccount" }, "replace");
  });

  bot.action("freeAccount:claim", async (ctx) => {
    await ctx.answerCbQuery("در حال آماده‌سازی اکانت تست...");
    if (!ctx.from) return;
    const user = await UserService.getByTelegramId(ctx.from.id);
    if (!user) return;
    try {
      const client = await FreeAccountService.claimXray(user.id);
      await ctx.reply(
        `🎉 اکانت تست Xray شما آماده است

━━━━━━━━━━━━━━━━

👤 شناسه سرویس:
${client.clientEmail}

⏳ اعتبار:
${client.expiresAt.toLocaleDateString("fa-IR")}

📦 این سرویس به بخش «اکانت‌های من» اضافه شد.`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: "📦 مشاهده اکانت", callback_data: callbackFor("account.xray", { xrayClientId: client.id }) }],
              [{ text: "🏠 خانه", callback_data: nav.home() }],
            ],
          },
        },
      );
    } catch (error) {
      const failedProvision = !(error instanceof FreeAccountError);
      await ctx.reply(failedProvision ? "درخواست ثبت شد اما ساخت اکانت تست نیازمند بررسی است." : formatFreeAccountError(error), {
        reply_markup: {
          inline_keyboard: [
            [{ text: "📦 اکانت‌های من", callback_data: nav.accountDetails() }],
            [{ text: "🎫 پشتیبانی", callback_data: nav.support() }],
          ],
        },
      });
    }
  });
}
