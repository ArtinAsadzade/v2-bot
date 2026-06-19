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


export function registerNavigationHandlers(bot: AppBot) {
  registerFlowEngine(bot);

  async function handleQuickReplyNavigation(ctx: AppContext, text: string) {
    const target = quickReplyTarget(text);
    if (!target) return false;
    if (target === "refresh") {
      const stack = ctx.session.navigation?.stack ?? [];
      const current = stack[stack.length - 1] ?? { id: "home" as const };
      await renderPanel(ctx, current, "replace", RenderMode.SEND_NEW);
      return true;
    }
    if (target === "claimFree") {
      await renderPanel(ctx, { id: "freeAccount" }, "replace");
      return true;
    }
    if (target === "newTicket") {
      if (!ctx.from) return true;
      const user = await UserService.getByTelegramId(ctx.from.id);
      if (!user) return true;
      const ticket = await SupportService.getOrCreateOpenTicket(user.id);
      ctx.session.liveTicketId = ticket.id;
      ctx.session.liveTicketRole = "user";
      await ctx.reply(
        `💬 گفتگوی پشتیبانی فعال شد

تیکت: #${ticket.id.slice(-6).toUpperCase()}

پیام خود را ارسال کنید.`,
        {
          reply_markup: supportCloseHomeInlineKeyboard(ticket.id),
        },
      );
      return true;
    }
    if (target.id.startsWith("admin") && (!ctx.from || !(await isAdminByTelegramId(ctx.from.id)))) {
      await ctx.reply(unauthorizedMessage());
      return true;
    }
    if (target.id === "home") {
      ctx.session.liveTicketId = undefined;
      ctx.session.liveTicketRole = undefined;
      ctx.session.flow = undefined;
    }
    await renderPanel(ctx, target, "replace");
    return true;
  }

  // Temporary compatibility redirects for old inline buttons. New visible buttons must use callbackFor()/nav:* actions.
  const legacyViews = new Map<string, Parameters<typeof renderPanel>[1]>([
    ["home", { id: "home" }],
    ["shop", { id: "shop.categories" }],
    ["wallet", { id: "wallet" }],
    ["deposit", { id: "deposit" }],
    ["support", { id: "support" }],
    ["referral", { id: "referral" }],
    ["account", { id: "account" }],
    ["freeAccount", { id: "freeAccount" }],
    ["admin:dashboard", { id: "admin.dashboard" }],
    ["admin:deposits", { id: "admin.deposits" }],
    ["admin:tickets", { id: "admin.tickets" }],
    ["admin:users", { id: "admin.users" }],
    ["admin:coupons", { id: "admin.coupons" }],
  ]);

  for (const [action, state] of legacyViews.entries()) {
    bot.action(action, async (ctx) => {
      await ctx.answerCbQuery();
      if (state.id.startsWith("admin") && (!ctx.from || !(await isAdminByTelegramId(ctx.from.id)))) {
        await ctx.answerCbQuery("دسترسی غیرمجاز");
        return;
      }
      ctx.session.flow = undefined;
      if (action === "home") {
        ctx.session.liveTicketId = undefined;
        ctx.session.liveTicketRole = undefined;
      }
      await renderPanel(ctx, state, "replace");
    });
  }

  bot.action("cancel", async (ctx) => {
    ctx.session.flow = undefined;
    ctx.session.liveTicketId = undefined;
    ctx.session.liveTicketRole = undefined;
    await ctx.answerCbQuery("لغو شد");
    await renderPanel(ctx, { id: "home" }, "replace");
  });


  bot.action(/^nav:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (ctx.match[1] === "back") return goBack(ctx);
    const state = parseNavAction(`nav:${ctx.match[1]}`);
    if (!state) {
      MonitoringService.record({
        type: "BUTTON_DATA_INVALID",
        section: "Telegram Callback",
        description: `Invalid nav callback: nav:${ctx.match[1]}`,
        telegramId: ctx.from?.id ? String(ctx.from.id) : undefined,
        userId: ctx.state.userId,
        severity: "warning",
        suggestedAction: "callback_data دکمه‌های منتشرشده را بررسی کنید.",
      });
      return;
    }
    if (state.id.startsWith("admin") && (!ctx.from || !(await isAdminByTelegramId(ctx.from.id)))) {
      await ctx.answerCbQuery("دسترسی غیرمجاز");
      return;
    }
    await renderPanel(ctx, state, "push", RenderMode.EDIT_CURRENT);
  });

  bot.on("photo", async (ctx, next) => {
    const photo = ctx.message.photo[ctx.message.photo.length - 1];
    if (photo && (await handleActiveFlowPhoto(ctx, photo.file_id))) return;
    return next();
  });
}
