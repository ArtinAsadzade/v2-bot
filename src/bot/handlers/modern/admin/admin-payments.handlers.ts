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

export function registerAdminPaymentsHandlers(bot: AppBot) {
  bot.action(/^admin:wallet:status:([^:]+):(active|inactive)$/, async (ctx) => {
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return ctx.answerCbQuery("دسترسی غیرمجاز");
    await ctx.answerCbQuery();
    await AdminService.setCryptoWalletStatus(ctx.match[1], ctx.match[2] as "active" | "inactive", String(ctx.from.id));
    await renderPanel(ctx, { id: "admin.wallet", params: { walletId: ctx.match[1] } }, "replace");
  });

  bot.action(/^admin:wallet:delete:confirm:([^:]+)$/, async (ctx) => {
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return ctx.answerCbQuery("دسترسی غیرمجاز");
    await ctx.answerCbQuery();
    await ctx.reply("⚠️ این کیف پول حذف شود؟ اگر پرداخت فعال داشته باشد حذف انجام نمی‌شود.", {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "تایید حذف", callback_data: actionFor("admin:wallet:delete:force", ctx.match[1]) },
            { text: "لغو", callback_data: callbackFor("admin.wallet", { walletId: ctx.match[1] }) },
          ],
        ],
      },
    });
  });

  bot.action(/^admin:wallet:delete:force:([^:]+)$/, async (ctx) => {
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return ctx.answerCbQuery("دسترسی غیرمجاز");
    await ctx.answerCbQuery();
    try {
      await AdminService.deleteCryptoWallet(ctx.match[1], String(ctx.from.id));
      await renderPanel(ctx, { id: "admin.wallets" }, "replace");
    } catch (error) {
      await ctx.reply(error instanceof Error ? `⚠️ ${error.message}` : "⚠️ حذف کیف پول ناموفق بود.");
      await renderPanel(ctx, { id: "admin.wallet", params: { walletId: ctx.match[1] } }, "replace");
    }
  });

  bot.action(/^admin:deposit:(approve|reject):(.+)$/, async (ctx) => {
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return ctx.answerCbQuery("دسترسی غیرمجاز");
    await ctx.answerCbQuery();
    try {
      if (ctx.match[1] === "approve") await DepositService.approve(ctx.match[2], String(ctx.from.id));
      else await DepositService.reject(ctx.match[2], String(ctx.from.id));
    } catch (error) {
      await ctx.answerCbQuery(error instanceof Error ? error.message : "عملیات ناموفق بود");
    }
    await renderPanel(ctx, { id: "admin.deposits" }, "replace");
  });
}
