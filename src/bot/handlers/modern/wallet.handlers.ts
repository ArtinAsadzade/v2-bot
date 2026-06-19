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


export function registerWalletHandlers(bot: AppBot) {
  bot.action(/^deposit:wallet:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (!ctx.from) return;
    const flow = ctx.session.flow;
    if (!flow || flow.name !== "deposit_submit" || flow.step !== "wallet") {
      await ctx.reply("لطفاً ابتدا مبلغ شارژ کیف پول را وارد کنید.");
      return;
    }
    const user = await UserService.getByTelegramId(ctx.from.id);
    if (!user) return;
    try {
      const walletId = ctx.match[1];
      const amount = Number(flow.data.amount);
      const quote = await CryptoWalletService.quote(walletId, amount);
      const deposit = await DepositService.createDeposit(user.id, amount, walletId);
      flow.step = "receipt";
      flow.data.depositId = deposit.id;
      await ctx.reply(
        `💳 درخواست پرداخت آماده شد

مبلغ شارژ:
${quote.amount.toLocaleString("fa-IR")} تومان

رمز ارز:
${quote.wallet.coinName}

شبکه:
${quote.wallet.networkName}

قیمت دلاری هر ${quote.wallet.coinName}:
${quote.coinUsdPrice ? `${quote.coinUsdPrice.toLocaleString("fa-IR")} دلار` : "نرخ ذخیره‌شده"}

نرخ دلار به تومان:
${quote.usdTomanRate ? `${quote.usdTomanRate.toLocaleString("fa-IR")} تومان` : "نرخ ذخیره‌شده"}

قیمت تومان هر ${quote.wallet.coinName}:
${quote.exchangeRate.toLocaleString("fa-IR")} تومان

مبلغ نهایی قابل پرداخت:
${quote.cryptoAmount.toLocaleString("fa-IR", { maximumFractionDigits: 8 })} ${quote.wallet.coinName}

آدرس کیف پول:
${quote.wallet.walletAddress}

⏳ مهلت پرداخت: ۳۰ دقیقه
📤 پس از پرداخت، تصویر رسید را همین‌جا ارسال کنید.`,
        {
          reply_markup: {
            inline_keyboard: [
              [
                { text: "🔙 بازگشت", callback_data: actionFor("flow:back", "deposit", "amount") },
                { text: "🏠 خانه", callback_data: nav.home() },
              ],
              [{ text: "❌ لغو عملیات", callback_data: "flow:cancel" }],
            ],
          },
        },
      );
    } catch (error) {
      await ctx.reply(`⚠️ ${error instanceof Error ? error.message : "ایجاد درخواست شارژ ناموفق بود. لطفاً دوباره تلاش کنید."}`);
    }
  });
}
