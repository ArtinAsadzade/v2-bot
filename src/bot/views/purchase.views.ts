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
import { checkoutViewKeyboard } from "../keyboards/view-keyboards";
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

export function registerPurchaseViews() {
  registerView("shop.checkout", async (ctx, params) => {
    const user = ctx.from ? await UserService.getByTelegramId(ctx.from.id) : undefined;
    const product = await ProductService.getActiveProductForUser(params.productId);
    if (!product || !user) return { text: "⚠️ اطلاعات خرید کامل نیست. لطفاً دوباره از فروشگاه اقدام کنید.", keyboard: [] };
    const couponCode = ctx.session.selectedCoupons?.[product.id];
    let discountAmount = 0;
    let payableAmount = product.price;
    let couponLine: string | undefined;
    if (couponCode) {
      const validation = await CouponService.validateForCheckout({ code: couponCode, userId: user.id, originalAmount: product.price });
      if (validation.ok) {
        discountAmount = validation.discountAmount;
        payableAmount = validation.finalAmount;
        couponLine = validation.coupon.code;
        ctx.session.selectedCoupons = { ...(ctx.session.selectedCoupons ?? {}), [product.id]: validation.coupon.code };
      } else {
        delete ctx.session.selectedCoupons?.[product.id];
      }
    }
    const shortage = Math.max(payableAmount - user.balance, 0);
    const gateway = await PaymentGatewayService.get();
    const couponRemoveAction = actionFor("coupon:remove", product.id);
    const couponChangeAction = actionFor("coupon:change", product.id);
    const couponButtonLabels = couponLine ? ["تغییر کد تخفیف", "حذف کد تخفیف"] : ["افزودن کد تخفیف"];
    const manualBackLabel = "🔙 بازگشت";
    void couponRemoveAction;
    void couponChangeAction;
    void couponButtonLabels;
    void manualBackLabel;
    const keyboard = checkoutViewKeyboard(product.id, gateway.enabled, Boolean(couponLine));
    return {
      text: joinSections([
        card(`${uiIcons.invoice} خلاصه سفارش`, [`${uiIcons.product} محصول: ${product.title}`]),
        section(sectionTitles.price, [`مبلغ پایه: ${money(product.price)}`]),
        section(sectionTitles.discount, [couponLine ? `کد تخفیف: ${couponLine}` : "کدی ثبت نشده است.", discountAmount > 0 ? `مبلغ تخفیف: ${money(discountAmount)}` : undefined]),
        section(sectionTitles.finalAmount, [`${money(payableAmount)}`]),
        section(sectionTitles.wallet, [`موجودی کیف پول: ${money(user.balance)}`, shortage > 0 ? `${uiIcons.warning} کسری کیف پول: ${money(shortage)}` : statusLabels.success]),
      ]),
      keyboard,
      navigation: { back: false, home: false },
    };
  });
}
