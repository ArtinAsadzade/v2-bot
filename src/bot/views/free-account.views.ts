import { registerView, callbackFor, actionFor, type UiKeyboard } from "../navigation/panel-ui";
import { createCallbackToken, tokenAction } from "../navigation/callback-tokens";
import { isAdminByTelegramId } from "../middlewares/admin.middleware";
import { UserService } from "../../modules/user/user.service";
import { ProductService } from "../../modules/product/product.service";
import { AdminService } from "../../modules/admin/admin.service";
import { ReferralService } from "../../modules/referral/referral.service";
import { FreeAccountService, FREE_ACCOUNT_STATUS_LABELS, formatFreeAccountDate } from "../../modules/free-account/free-account.service";
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

export function registerFreeAccountViews() {
  registerView("freeAccount", async (ctx) => {
    const user = ctx.from ? await UserService.getByTelegramId(ctx.from.id) : undefined;
    if (!user) return { text: "⚠️ پروفایل شما پیدا نشد. لطفاً /start را ارسال کنید.", keyboard: [] };
    const e = await FreeAccountService.xrayEligibility(user.id);
    const cfg = e.config;
    const blocked = !e.eligible;
    const reason = user.isBanned
      ? "حساب شما محدود شده است."
      : !cfg.enabled
        ? "اکانت تست فعلاً غیرفعال است."
        : e.active
          ? "شما یک اکانت تست فعال دارید."
          : e.nextAvailableAt && e.nextAvailableAt > new Date()
            ? "شما در ۳۰ روز گذشته اکانت تست دریافت کرده‌اید."
            : cfg.available <= 0
              ? "موجودی اکانت تست تکمیل شده است."
              : "آماده دریافت";
    return {
      replyKeyboard: "freeAccount",
      text: joinSections([
        card(userLabels.freeAccount, [
          `📌 وضعیت شما: ${reason}`,
          `📅 آخرین دریافت: ${formatFreeAccountDate(e.lastClaimAt)}`,
          `⏳ دریافت بعدی: ${formatFreeAccountDate(e.nextAvailableAt && e.nextAvailableAt > new Date() ? e.nextAvailableAt : undefined)}`,
        ]),
        section(sectionTitles.serviceSpecs, [
          `${uiIcons.product} موجودی: ${cfg.available.toLocaleString("fa-IR")} از ${cfg.stockLimit.toLocaleString("fa-IR")}`,
          `${sectionTitles.traffic}: ${formatXrayBytes(cfg.trafficBytes)}`,
          `${sectionTitles.duration}: ${cfg.durationDays.toLocaleString("fa-IR")} روز`,
        ]),
      ]),
      keyboard: blocked
        ? [
            [
              { text: "📦 اکانت‌های من", action: callbackFor("account.details") },
              { text: "🎫 پشتیبانی", action: callbackFor("support") },
            ],
          ]
        : [[{ text: "✅ دریافت اکانت تست", action: "freeAccount:claim" }]],
    };
  });
}
