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


export function registerPurchaseHandlers(bot: AppBot) {
  async function sendPurchaseDelivery(ctx: AppContext, result: Awaited<ReturnType<typeof PurchaseService.buyProduct>>) {
    if (result.product.mode === "xray_auto") {
      const client =
        result.xrayClient ??
        (result.orderItem?.xrayClientId ? await prisma.xrayClient.findUnique({ where: { id: result.orderItem.xrayClientId } }) : null);
      if (!client) {
        await ctx.reply(
          `✅ خرید با موفقیت انجام شد

سرویس ساخته شده است. لطفاً از بخش «📦 اکانت‌های من» آن را باز کنید.`,
          {
            reply_markup: accountHomeInlineKeyboard(),
          },
        );
        return;
      }
      await ctx.reply(
        `✅ خرید با موفقیت انجام شد

سرویس شما ساخته شد و آماده استفاده است.

برای دریافت لینک اشتراک، QR و کانفیگ‌ها از دکمه‌های زیر استفاده کنید.`,
        {
          reply_markup: xrayPurchaseDeliveryKeyboard(client.id),
        },
      );
      return;
    }
    await ctx.reply(
      purchaseSuccessMessage({
        productTitle: result.product.title,
        username: result.account.username,
        subscriptionLink: result.account.subscriptionLink,
        config: result.account.configLink,
        expiresAt: result.expiresAt,
      }),
      {
        reply_markup: standardPurchaseDeliveryKeyboard(),
      },
    );
  }

  bot.action(/^buy:(?!confirm:|instant:)(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    await renderPanel(ctx, { id: "shop.checkout", params: { productId: ctx.match[1] } }, "replace", RenderMode.EDIT_CURRENT);
  });


  bot.action(/^buy:cancel_existing:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery("درخواست قبلی لغو شد");
    if (!ctx.from) return;
    const user = await UserService.getByTelegramId(ctx.from.id);
    if (!user) return;
    const productId = ctx.match[1];
    await PaymentInvoiceService.cancelExistingPurchaseIntent(user.id, productId);
    await renderPanel(ctx, { id: "shop.checkout", params: { productId } }, "replace", RenderMode.SEND_NEW);
  });

  bot.action(/^buy:confirm:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (!ctx.from) return;
    const user = await UserService.getByTelegramId(ctx.from.id);
    if (!user) return;
    const productId = ctx.match[1];
    try {
      const existing = await PaymentInvoiceService.resolveExistingPurchaseIntent(user.id, productId);
      if (existing.action === "reuse_invoice") {
        await ctx.reply(pendingInvoiceExistsMessage(), { reply_markup: pendingInvoiceRecoveryKeyboard(productId, existing.invoice.paymentLink) });
        return;
      }
      if (existing.action === "processing") {
        await ctx.reply(previousPurchaseProcessingMessage(), { reply_markup: processingPurchaseRecoveryKeyboard(productId) });
        return;
      }
      if (existing.action === "expired_and_released") await ctx.reply("Your previous purchase request expired. You can start a new purchase now.");
      await ctx.editMessageText("⏳ در حال بررسی موجودی کیف پول و آماده‌سازی اکانت...", { reply_markup: { inline_keyboard: [] } });
      const coupon = ctx.session.selectedCoupons?.[productId];
      const result = await PurchaseService.buyProduct(user.id, productId, coupon);
      delete ctx.session.selectedCoupons?.[productId];
      await ctx.editMessageText(
        result.product.mode === "xray_auto"
          ? "✅ خرید با موفقیت تکمیل شد. سرویس Xray آماده مشاهده است."
          : "✅ خرید با موفقیت تکمیل شد. اطلاعات اکانت در پیام بعدی ارسال شد.",
        { reply_markup: { inline_keyboard: [] } },
      );
      await sendPurchaseDelivery(ctx, result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "در انجام درخواست مشکلی پیش آمد. لطفاً چند لحظه دیگر دوباره تلاش کنید.";
      if (/کد تخفیف|کوپن|تخفیف/.test(message)) {
        await ctx.reply(`⚠️ کد تخفیف دیگر قابل استفاده نیست\n\nاین کد بعد از اعمال اولیه منقضی یا مصرف شده است.`, {
          reply_markup: {
            inline_keyboard: [
              [
                { text: "🎟 کد تخفیف جدید", callback_data: actionFor("flow:start", "coupon_code", productId) },
                { text: "🗑 حذف کد تخفیف", callback_data: actionFor("coupon:remove", productId) },
              ],
              [{ text: "🔙 بازگشت", callback_data: callbackFor("shop.checkout", { productId }) }],
            ],
          },
        });
      } else {
        await ctx.reply(`⚠️ خرید تکمیل نشد\n\n${message}`, {
          reply_markup: {
            inline_keyboard: [
              [
                { text: "💳 شارژ کیف پول", callback_data: callbackFor("deposit") },
                { text: "⬅️ بازگشت به پیش‌فاکتور", callback_data: callbackFor("shop.checkout", { productId }) },
              ],
              [{ text: "🎫 پشتیبانی", callback_data: nav.support() }],
            ],
          },
        });
      }
    }
  });

  bot.action(/^buy:instant:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (!ctx.from) return;
    const user = await UserService.getByTelegramId(ctx.from.id);
    if (!user) return;
    const productId = ctx.match[1];
    try {
      await ctx.editMessageText("⏳ در حال ایجاد فاکتور پرداخت آنی...", { reply_markup: { inline_keyboard: [] } });
      const existing = await PaymentInvoiceService.resolveExistingPurchaseIntent(user.id, productId);
      if (existing.action === "reuse_invoice") {
        await ctx.reply(pendingInvoiceExistsMessage(), { reply_markup: pendingInvoiceRecoveryKeyboard(productId, existing.invoice.paymentLink) });
        return;
      }
      if (existing.action === "processing") {
        await ctx.reply(previousPurchaseProcessingMessage(), { reply_markup: processingPurchaseRecoveryKeyboard(productId) });
        return;
      }
      if (existing.action === "expired_and_released") await ctx.reply("Your previous purchase request expired. You can start a new purchase now.");
      const product = await ProductService.getProduct(productId);
      const coupon = ctx.session.selectedCoupons?.[productId];
      const invoice = await PaymentInvoiceService.createProductInvoice(user.id, productId, coupon, { ignoreExisting: true });
      delete ctx.session.selectedCoupons?.[productId];
      await ctx.editMessageText("✅ فاکتور پرداخت آنی ساخته شد. جزئیات پرداخت در پیام بعدی ارسال شد.", { reply_markup: { inline_keyboard: [] } });
      await ctx.reply(
        `🧾 فاکتور پرداخت آماده شد

📦 سرویس:
${product?.title ?? "-"}

💰 مبلغ:
${invoice.originalAmount.toLocaleString("fa-IR")} تومان
🎟 تخفیف:
${invoice.discountAmount.toLocaleString("fa-IR")} تومان${
          invoice.couponCode
            ? `
🏷 کد تخفیف:
${invoice.couponCode}`
            : ""
        }
✅ مبلغ نهایی:
${invoice.amount.toLocaleString("fa-IR")} تومان

⚡ روش پرداخت:
پرداخت آنی

برای ادامه، روی دکمه پرداخت بزنید.`,
        InvoiceActionKeyboard(invoice.paymentLink ?? "", callbackFor("shop.checkout", { productId })),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "ایجاد پرداخت ناموفق بود";
      if (/کد تخفیف|کوپن|تخفیف/.test(message)) {
        await ctx.reply(`⚠️ کد تخفیف دیگر قابل استفاده نیست\n\nاین کد بعد از اعمال اولیه منقضی یا مصرف شده است.`, {
          reply_markup: {
            inline_keyboard: [
              [
                { text: "🎟 کد تخفیف جدید", callback_data: actionFor("flow:start", "coupon_code", productId) },
                { text: "🗑 حذف کد تخفیف", callback_data: actionFor("coupon:remove", productId) },
              ],
              [{ text: "🔙 بازگشت", callback_data: callbackFor("shop.checkout", { productId }) }],
            ],
          },
        });
      } else {
        await ctx.reply(`⚠️ ایجاد فاکتور ممکن نیست\n\n${message}`, {
          reply_markup: {
            inline_keyboard: [
              [
                { text: "🔙 بازگشت", callback_data: callbackFor("shop.checkout", { productId }) },
                { text: "🎫 پشتیبانی", callback_data: nav.support() },
              ],
            ],
          },
        });
      }
    }
  });
}
