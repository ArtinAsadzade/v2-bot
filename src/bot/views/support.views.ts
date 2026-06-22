import { registerView, callbackFor, actionFor, type UiKeyboard } from "../navigation/panel-ui";
import { createCallbackToken, tokenAction } from "../navigation/callback-tokens";
import { isAdminByTelegramId } from "../middlewares/admin.middleware";
import { UserService } from "../../modules/user/user.service";
import { ProductService } from "../../modules/product/product.service";
import { AdminService } from "../../modules/admin/admin.service";
import { ReferralService } from "../../modules/referral/referral.service";
import {
  FreeAccountService,
  FREE_ACCOUNT_STATUS_LABELS,
  formatFreeAccountDate,
} from "../../modules/free-account/free-account.service";
import { SupportService } from "../../modules/support/support.service";
import { CouponService } from "../../modules/coupon/coupon.service";
import { BroadcastService, BROADCAST_TARGET_LABELS } from "../../modules/broadcast/broadcast.service";
import { PaymentGatewayService, PaymentInvoiceService, maskApiKey } from "../../modules/payment/payment.service";
import { ProductGuideService } from "../../modules/system/product-guide.service";
import { ForcedJoinService } from "../../modules/system/forced-join.service";
import { PublicPlansService } from "../../modules/product/public-plans.service";
import {
  formatXrayBytes,
  maskToken,
  normalizeXrayStatus,
  XrayClientService,
  XrayPanelService,
  xrayTrafficSnapshot,
} from "../../modules/xray/xray.service";
import type { PaymentInvoiceStatus } from "@prisma/client";
import { accountSummaryMessage, errorMessage, walletSummaryMessage } from "../../utils/messages";
import { formatToman } from "../../utils/money";
import {
  accountStatusLabel,
  divider,
  formatPageCount,
  formatStockLabel,
  formatUserLine,
  getPageParam,
  paymentStatusLabel,
  progressBar,
  purchasedAccountStatusLabel,
  resolveFreeAccountExpiry,
  shortId,
  walletStatusLabel,
  yesNoStatus,
} from "../../utils/formatters";
import { homeKeyboard } from "../keyboards/common.keyboard";
import { navRow } from "../keyboards/panel-keyboard.helpers";
import { card, joinSections, section } from "../ui/layout";
import { sectionTitles } from "../ui/sections";
import { actionLabels, adminLabels, statusLabels, userLabels } from "../ui/labels";
import { uiIcons } from "../ui/icons";
import { MonitoringService } from "../../services/monitoring.service";
import { prisma } from "../../services/prisma";

const money = formatToman;
const page = getPageParam;
const pages = formatPageCount;
const userLine = formatUserLine;
const stockLabel = formatStockLabel;
const freeAccountExpiry = resolveFreeAccountExpiry;
const yesNo = yesNoStatus;

export function registerSupportViews() {
  registerView("support", async (ctx) => {
    const user = ctx.from ? await UserService.getByTelegramId(ctx.from.id) : undefined;
    if (!user) return { text: "⚠️ پروفایل شما پیدا نشد. لطفاً /start را ارسال کنید.", keyboard: [] };
    const tickets = await SupportService.listUserTickets(user.id);
    const latestOpen = tickets.find((ticket) => ticket.status === "open");
    return {
      replyKeyboard: "support",
      text: joinSections([
        card(userLabels.support, ["برای ارتباط با پشتیبانی وارد گفتگو شوید و پیام خود را ارسال کنید. پاسخ‌ها در همین چت برای شما نمایش داده می‌شود.", `📌 وضعیت آخرین تیکت: ${latestOpen ? `باز (#${shortId(latestOpen.id)})` : "تیکت باز ندارید"}`]),
        section(`${uiIcons.invoice} تیکت‌های اخیر`, [tickets.map((ticket) => `• #${shortId(ticket.id)} · ${ticket.status === "open" ? statusLabels.active : "🔒 بسته"} · ${ticket.updatedAt.toLocaleString("fa-IR")}\n  ${ticket.messages[0]?.message ?? "بدون پیام"}`).join("\n") || "هنوز تیکتی ثبت نشده است."]),
      ]),
      keyboard: [
        navRow({ text: "✉️ تیکت جدید", view: "support.new" }),
        navRow({ text: "📋 تیکت‌های من", view: "support.tickets" }, { text: "📡 مشکل اتصال", view: "support.connection", tone: "danger" }),
        navRow({ text: "💳 مشکل پرداخت", view: "support.payment", tone: "danger" }, { text: "💬 ارتباط با پشتیبانی", view: "support.contact" }),
      ],
    };
  });
  registerView("support.new", async () => ({ text: card("✉️ تیکت جدید", ["برای شروع گفتگو دکمه زیر را بزنید و پیام خود را ارسال کنید."]), keyboard: [[{ text: "✉️ شروع گفتگو", action: "support:chat:start" }]] }));
  registerView("support.tickets", async (ctx) => {
    const user = ctx.from ? await UserService.getByTelegramId(ctx.from.id) : undefined;
    if (!user) return { text: "⚠️ پروفایل شما پیدا نشد.", keyboard: [] };
    const tickets = await SupportService.listUserTickets(user.id);
    return { text: card("📋 تیکت‌های من", [tickets.length ? tickets.map((ticket) => `#${shortId(ticket.id)} · ${ticket.status === "open" ? "باز" : "بسته"}`).join("\n") : "تیکتی ثبت نشده است."]), keyboard: tickets.slice(0, 5).map((ticket) => [{ text: `👁 تیکت #${shortId(ticket.id)}`, action: `support:chat:${ticket.id}` }]) };
  });
  registerView("support.connection", async () => ({ text: card("📡 مشکل اتصال", ["اگر سرویس وصل نمی‌شود، کانفیگ را دوباره بررسی کنید و سپس تیکت بزنید."]), keyboard: [[{ text: "✉️ ثبت مشکل اتصال", action: "support:chat:start" }]] }));
  registerView("support.payment", async () => ({ text: card("💳 مشکل پرداخت", ["برای پیگیری پرداخت، رسید یا شناسه تراکنش را در تیکت ارسال کنید."]), keyboard: [[{ text: "✉️ ثبت مشکل پرداخت", action: "support:chat:start" }]] }));
  registerView("support.contact", async () => ({ text: card("💬 ارتباط با پشتیبانی", ["پیام خود را در گفتگو ارسال کنید؛ پاسخ در همین چت نمایش داده می‌شود."]), keyboard: [[{ text: "💬 شروع گفتگو", action: "support:chat:start" }]] }));
}
