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
    const keyboard: UiKeyboard = [];
    if (couponLine)
      keyboard.push([
        { text: "🗑 حذف کد تخفیف", action: actionFor("coupon:remove", product.id) },
        { text: "🎟 تغییر کد تخفیف", action: actionFor("coupon:change", product.id) },
      ]);
    else keyboard.push([{ text: "🎟 افزودن کد تخفیف", action: actionFor("flow:start", "coupon_code", product.id) }]);
    const paymentRow = [{ text: "💳 پرداخت با کیف پول", action: actionFor("buy:confirm", product.id) }];
    if (gateway.enabled) paymentRow.push({ text: "⚡ پرداخت آنی", action: actionFor("buy:instant", product.id) });
    keyboard.push(paymentRow, [{ text: "🔙 بازگشت", action: callbackFor("shop.product", { productId: product.id }) }]);
    return {
      text: `🧾 خلاصه سفارش\n\n📦 محصول:\n${product.title}\n\n${couponLine ? `🎟 کد تخفیف:\n${couponLine}\n\n` : ""}💰 مبلغ:\n${money(product.price)}${discountAmount > 0 ? `\n\n🎁 تخفیف:\n${money(discountAmount)}` : ""}\n\n✅ مبلغ نهایی:\n${money(payableAmount)}\n\n💳 موجودی کیف پول:\n${money(user.balance)}${shortage > 0 ? `\n\n⚠️ کسری کیف پول: ${money(shortage)}` : ""}`,
      keyboard,
      navigation: { back: false, home: false },
    };
  });
}
