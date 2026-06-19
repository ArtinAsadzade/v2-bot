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


export function registerSupportHandlers(bot: AppBot) {
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

  bot.action("support:chat:start", async (ctx) => {
    await ctx.answerCbQuery();
    if (!ctx.from) return;
    const user = await UserService.getByTelegramId(ctx.from.id);
    if (!user) return;
    const ticket = await SupportService.getOrCreateOpenTicket(user.id);
    ctx.session.liveTicketId = ticket.id;
    ctx.session.liveTicketRole = "user";
    await ctx.reply(
      `💬 گفتگوی پشتیبانی فعال شد

تیکت: #${ticket.id.slice(-6).toUpperCase()}

پیام خود را ارسال کنید. محدودیتی در تعداد پیام‌ها وجود ندارد.`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "✅ بستن تیکت", callback_data: actionFor("support:close", ticket.id) }],
            [{ text: "🏠 خانه", callback_data: nav.home() }],
          ],
        },
      },
    );
  });

  bot.action(/^support:chat:([^:]+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (!ctx.from) return;
    const user = await UserService.getByTelegramId(ctx.from.id);
    if (!user) return;
    const ticket = await SupportService.getTicketWithUser(ctx.match[1]);
    if (!ticket || ticket.userId !== user.id) {
      await ctx.reply("⚠️ تیکت پیدا نشد.");
      return;
    }
    if (ticket.status === "closed") await SupportService.reopenTicket(ticket.id, user.id, "user");
    ctx.session.liveTicketId = ticket.id;
    ctx.session.liveTicketRole = "user";
    await ctx.reply(
      `💬 گفتگو باز شد

تیکت: #${ticket.id.slice(-6).toUpperCase()}
پیام بعدی خود را ارسال کنید.`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "✅ بستن تیکت", callback_data: actionFor("support:close", ticket.id) }],
            [{ text: "📜 مشاهده تاریخچه", callback_data: nav.support() }],
          ],
        },
      },
    );
  });

  bot.action(/^support:close:([^:]+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (!ctx.from) return;
    const user = await UserService.getByTelegramId(ctx.from.id);
    if (!user) return;
    const ticket = await SupportService.getTicketWithUser(ctx.match[1]);
    if (!ticket || ticket.userId !== user.id) return ctx.reply("⚠️ تیکت پیدا نشد.");
    await SupportService.closeTicket(ticket.id, user.id, "user");
    ctx.session.liveTicketId = undefined;
    ctx.session.liveTicketRole = undefined;
    await renderPanel(ctx, { id: "support" }, "replace");
  });

  bot.action(/^support:admin:chat:([^:]+)$/, async (ctx) => {
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return ctx.answerCbQuery("دسترسی غیرمجاز");
    await ctx.answerCbQuery();
    let ticket = await SupportService.getTicketWithUser(ctx.match[1]);
    if (!ticket) return ctx.reply("⚠️ تیکت پیدا نشد.");
    if (ticket.status === "closed") {
      await SupportService.reopenTicket(ticket.id, String(ctx.from.id), "admin");
      ticket = await SupportService.getTicketWithUser(ticket.id);
      if (!ticket) return ctx.reply("⚠️ تیکت پیدا نشد.");
    }
    ctx.session.liveTicketId = ticket.id;
    ctx.session.liveTicketRole = "admin";
    await ctx.reply(
      `💬 چت ادمین فعال شد

تیکت: #${ticket.id.slice(-6).toUpperCase()}
کاربر: ${ticket.user.telegramId}

پاسخ خود را ارسال کنید. هر پیام جداگانه برای کاربر ارسال می‌شود.`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: "👁 مشاهده تاریخچه", callback_data: callbackFor("admin.ticket", { ticketId: ticket.id }) },
              { text: "✅ بستن", callback_data: actionFor("admin:ticket:close", ticket.id) },
            ],
            [{ text: "🛡 پنل مدیریت", callback_data: callbackFor("admin.dashboard") }],
          ],
        },
      },
    );
  });

  bot.on("text", async (ctx, next) => {
    const text = ctx.message.text.trim();
    if (await handleQuickReplyNavigation(ctx, text)) return;
    if (await handleActiveFlowText(ctx, text)) return;
    if (ctx.session.liveTicketId && ctx.session.liveTicketRole) {
      try {
        if (ctx.session.liveTicketRole === "admin") {
          if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return next();
          await SupportService.addAdminReply(ctx.session.liveTicketId, String(ctx.from.id), text);
          await ctx.reply("✅ پاسخ ارسال شد. برای ادامه گفتگو، پیام بعدی را ارسال کنید.", {
            reply_markup: {
              inline_keyboard: [
                [
                  { text: "👁 مشاهده تیکت", callback_data: callbackFor("admin.ticket", { ticketId: ctx.session.liveTicketId }) },
                  { text: "✅ بستن", callback_data: actionFor("admin:ticket:close", ctx.session.liveTicketId) },
                ],
              ],
            },
          });
          return;
        }
        const user = ctx.from ? await UserService.getByTelegramId(ctx.from.id) : undefined;
        if (!user) return next();
        await SupportService.addUserMessage(ctx.session.liveTicketId, user.id, text);
        await ctx.reply("📩 پیام شما ارسال شد. برای ادامه گفتگو، پیام بعدی را ارسال کنید.", {
          reply_markup: {
            inline_keyboard: [
              [{ text: "✅ بستن تیکت", callback_data: actionFor("support:close", ctx.session.liveTicketId) }],
              [{ text: "🏠 خانه", callback_data: nav.home() }],
            ],
          },
        });
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        MonitoringService.record({
          type: "TICKET_HANDLER_FAILED",
          section: "Ticket Handler",
          description: message,
          telegramId: ctx.from?.id ? String(ctx.from.id) : undefined,
          userId: ctx.state.userId,
          severity: "critical",
          suggestedAction: "وضعیت تیکت، دسترسی پیام‌رسانی ربات و دیتابیس را بررسی کنید.",
          metadata: { ticketId: ctx.session.liveTicketId, role: ctx.session.liveTicketRole },
        });
        await ctx.reply(`⚠️ ${error instanceof Error ? error.message : "ارسال پیام ناموفق بود."}`);
        return;
      }
    }
    return next();
  });
}
