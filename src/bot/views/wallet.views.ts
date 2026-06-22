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

export function registerWalletViews() {
  registerView("wallet", async (ctx) => {
    const user = ctx.from ? await UserService.getByTelegramId(ctx.from.id) : undefined;
    const dashboard = user ? await UserService.dashboard(user.id) : undefined;
    const recent =
      dashboard?.walletTransactions
        .slice(0, 3)
        .map(
          (tx) =>
            `• ${tx.type === "credit" || tx.type === "transfer_in" ? "افزایش" : "کاهش"}: ${money(tx.amount)} · ${tx.createdAt.toLocaleDateString("fa-IR")}`,
        )
        .join("\n") || "تراکنش اخیری ثبت نشده است.";
    return {
      replyKeyboard: "wallet",
      text: joinSections([card(userLabels.wallet, [`موجودی فعلی: ${money(user?.balance ?? 0)}`]), section(`${uiIcons.invoice} تراکنش‌های اخیر`, [recent]), section(sectionTitles.quickActions, ["روش شارژ یا گزارش مالی موردنظر را انتخاب کنید."])]),
      keyboard: [
        navRow({ text: "💳 موجودی", view: "wallet.balance" }, { text: "➕ افزایش موجودی", view: "wallet.topup", tone: "success" }),
        navRow({ text: "📜 تراکنش‌ها", view: "wallet.transactions" }, { text: "🧾 فاکتورها", view: "wallet.invoices" }),
        navRow({ text: "🎟 کد تخفیف / هدیه", view: "wallet.redeem" }),
      ],
    };
  });
  const renderWalletHistory = async (ctx: Parameters<import("../navigation/panel-ui").ViewRenderer>[0]) => {
    const user = ctx.from ? await UserService.getByTelegramId(ctx.from.id) : undefined;
    if (!user) return { text: "⚠️ پروفایل شما پیدا نشد.", keyboard: [] };
    const dashboard = await UserService.dashboard(user.id);
    return {
      text: joinSections([card(`${uiIcons.invoice} گردش کیف پول`, [dashboard.walletTransactions.map((tx) => `${tx.type === "credit" || tx.type === "transfer_in" ? "🟢" : "🔴"} ${tx.description}\n${money(tx.amount)} · ${tx.createdAt.toLocaleString("fa-IR")}`).join("\n\n") || "هنوز تراکنشی ثبت نشده است."])]),
      keyboard: [[{ text: "➕ شارژ کیف پول", action: callbackFor("wallet.topup") }]],
    };
  };
  registerView("wallet.history", renderWalletHistory);

  registerView("wallet.balance", async (ctx) => {
    const user = ctx.from ? await UserService.getByTelegramId(ctx.from.id) : undefined;
    return { text: card("💳 موجودی", [`موجودی فعلی: ${money(user?.balance ?? 0)}`]), keyboard: [navRow({ text: "➕ افزایش موجودی", view: "wallet.topup", tone: "success" })] };
  });
  registerView("wallet.transactions", async (ctx) => renderWalletHistory(ctx));
  registerView("wallet.invoices", async () => ({ text: card("🧾 فاکتورها", ["فاکتورهای پرداخت از بخش خرید و پرداخت قابل پیگیری هستند."]), keyboard: [] }));
  registerView("wallet.redeem", async () => ({ text: card("🎟 کد تخفیف / هدیه", ["برای ثبت کد، دکمه زیر را بزنید."]), keyboard: [[{ text: "🎟 وارد کردن کد", action: actionFor("flow:start", "coupon_code") }]] }));
  registerView("wallet.topup", async () => {
    const gateway = await PaymentGatewayService.get();
    const keyboard: UiKeyboard = [[{ text: "💎 پرداخت با رمزارز", action: "flow:start:deposit_submit" }]];
    if (gateway.enabled) keyboard[0].push({ text: "⚡ پرداخت آنی", action: "flow:start:instant_topup" });
    return {
      text: joinSections([card(`${uiIcons.wallet} شارژ کیف پول`, ["در مرحله بعد مبلغ شارژ را وارد می‌کنید."]), section(sectionTitles.wallet, [gateway.enabled ? "پرداخت آنی و پرداخت با رمزارز فعال هستند." : "در حال حاضر پرداخت با رمزارز فعال است."]), section(sectionTitles.dangerZone, ["موجودی فقط پس از تأیید نهایی پرداخت به کیف پول اضافه می‌شود."])]),
      keyboard,
    };
  });
  registerView("deposit", async () => ({ text: "در حال انتقال به افزایش موجودی...", keyboard: [navRow({ text: "➕ افزایش موجودی", view: "wallet.topup", tone: "success" })] }));
}
