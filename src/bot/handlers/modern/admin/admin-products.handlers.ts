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
import { adminDangerConfirmKeyboard } from "../../../keyboards/admin-danger.keyboard";
import { adminDangerConfirmMessage } from "../../../messages/admin.messages";
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

export function registerAdminProductsHandlers(bot: AppBot) {
  bot.action(/^admin:category:status:([^:]+):([01])$/, async (ctx) => {
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return ctx.answerCbQuery("دسترسی غیرمجاز");
    await ctx.answerCbQuery();
    await AdminService.setCategoryActive(ctx.match[1], ctx.match[2] === "1", String(ctx.from.id));
    await renderPanel(ctx, { id: "admin.category", params: { categoryId: ctx.match[1] } }, "replace");
  });

  bot.action(/^admin:category:delete:([^:]+)$/, async (ctx) => {
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return ctx.answerCbQuery("دسترسی غیرمجاز");
    await ctx.answerCbQuery();
    await AdminService.deleteCategory(ctx.match[1], String(ctx.from.id));
    await renderPanel(ctx, { id: "admin.categories" }, "replace");
  });

  bot.action(/^admin:category:hard_delete:confirm:([^:]+)$/, async (ctx) => {
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return ctx.answerCbQuery("دسترسی غیرمجاز");
    await ctx.answerCbQuery();
    await ctx.reply(
      adminDangerConfirmMessage({
        action: "حذف دائمی دسته‌بندی",
        item: ctx.match[1],
        note: "این عملیات محصولات وابسته را هم حذف می‌کند و قابل بازگشت نیست.",
      }),
      adminDangerConfirmKeyboard(actionFor("admin:category:hard_delete:force", ctx.match[1]), callbackFor("admin.category", { categoryId: ctx.match[1] })),
    );
  });

  bot.action(/^admin:category:hard_delete:force:([^:]+)$/, async (ctx) => {
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return ctx.answerCbQuery("دسترسی غیرمجاز");
    await ctx.answerCbQuery();
    await AdminService.hardDeleteCategory(ctx.match[1], String(ctx.from.id), true);
    await renderPanel(ctx, { id: "admin.categories" }, "replace");
  });

  bot.action(/^admin:product:active:([^:]+):([01])$/, async (ctx) => {
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return ctx.answerCbQuery("دسترسی غیرمجاز");
    await ctx.answerCbQuery();
    await AdminService.setProductActive(ctx.match[1], ctx.match[2] === "1", String(ctx.from.id));
    await renderPanel(ctx, { id: "admin.product", params: { productId: ctx.match[1] } }, "replace");
  });

  bot.action(/^admin:product:duplicate:([^:]+)$/, async (ctx) => {
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return ctx.answerCbQuery("دسترسی غیرمجاز");
    await ctx.answerCbQuery();
    const product = await AdminService.duplicateProduct(ctx.match[1], String(ctx.from.id));
    await renderPanel(ctx, { id: "admin.product", params: { productId: product.id } }, "replace");
  });

  bot.action(/^admin:product:delete:([^:]+)$/, async (ctx) => {
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return ctx.answerCbQuery("دسترسی غیرمجاز");
    await ctx.answerCbQuery();
    await AdminService.deleteProduct(ctx.match[1], String(ctx.from.id));
    await renderPanel(ctx, { id: "admin.products" }, "replace");
  });

  bot.action(/^admin:product:hard_delete:confirm:([^:]+)$/, async (ctx) => {
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return ctx.answerCbQuery("دسترسی غیرمجاز");
    await ctx.answerCbQuery();
    await ctx.reply(
      adminDangerConfirmMessage({
        action: "حذف دائمی محصول",
        item: ctx.match[1],
        note: "اگر محصول سفارش فعال داشته باشد، با تایید نهایی هم حذف می‌شود.",
      }),
      adminDangerConfirmKeyboard(actionFor("admin:product:hard_delete:force", ctx.match[1]), callbackFor("admin.product", { productId: ctx.match[1] })),
    );
  });

  bot.action(/^admin:product:hard_delete:force:([^:]+)$/, async (ctx) => {
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return ctx.answerCbQuery("دسترسی غیرمجاز");
    await ctx.answerCbQuery();
    await AdminService.hardDeleteProduct(ctx.match[1], String(ctx.from.id), true);
    await renderPanel(ctx, { id: "admin.products" }, "replace");
  });
}
