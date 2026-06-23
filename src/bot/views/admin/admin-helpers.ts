import { registerView, callbackFor, actionFor, type UiKeyboard } from "../../navigation/panel-ui";
import { createCallbackToken, tokenAction } from "../../navigation/callback-tokens";
import { isAdminByTelegramId } from "../../middlewares/admin.middleware";
import { UserService } from "../../../modules/user/user.service";
import { ProductService } from "../../../modules/product/product.service";
import { AdminService } from "../../../modules/admin/admin.service";
import { adminShopViewModel, maskAdminSecret, xrayAdminStatusLabel, xrayCenterViewModel } from "../../../modules/admin/admin.view-models";
import { ReferralService } from "../../../modules/referral/referral.service";
import { FreeAccountService, FREE_ACCOUNT_STATUS_LABELS, formatFreeAccountDate } from "../../../modules/free-account/free-account.service";
import { SupportService } from "../../../modules/support/support.service";
import { CouponService } from "../../../modules/coupon/coupon.service";
import { BroadcastService, BROADCAST_TARGET_LABELS } from "../../../modules/broadcast/broadcast.service";
import { PaymentGatewayService, PaymentInvoiceService, maskApiKey } from "../../../modules/payment/payment.service";
import { ProductGuideService } from "../../../modules/system/product-guide.service";
import { ForcedJoinService } from "../../../modules/system/forced-join.service";
import { PublicPlansService } from "../../../modules/product/public-plans.service";
import { productNotDeletedWhere } from "../../../modules/product/visibility";
import {
  formatXrayBytes,
  maskToken,
  normalizeXrayStatus,
  XrayClientService,
  XrayPanelService,
  xrayTrafficSnapshot,
} from "../../../modules/xray/xray.service";
import { XrayDiagnosticsService } from "../../../modules/xray/xray-diagnostics.service";
import type { PaymentInvoiceStatus } from "@prisma/client";
import { accountSummaryMessage, errorMessage, walletSummaryMessage } from "../../../utils/messages";
import { formatToman } from "../../../utils/money";
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
} from "../../../utils/formatters";
import { homeKeyboard } from "../../keyboards/common.keyboard";
import { adminDashboardViewKeyboard } from "../../keyboards/view-keyboards";
import { card, joinSections, section } from "../../ui/layout";
import { sectionTitles } from "../../ui/sections";
import { actionLabels, adminLabels, statusLabels, userLabels } from "../../ui/labels";
import { uiIcons } from "../../ui/icons";
import { MonitoringService } from "../../../services/monitoring.service";
import { prisma } from "../../../services/prisma";

const money = formatToman;
const page = getPageParam;
const pages = formatPageCount;
const userLine = formatUserLine;
const stockLabel = formatStockLabel;
const freeAccountExpiry = resolveFreeAccountExpiry;
const yesNo = yesNoStatus;


export { registerView, callbackFor, actionFor, createCallbackToken, tokenAction, isAdminByTelegramId, UserService, ProductService, AdminService, adminShopViewModel, maskAdminSecret, xrayAdminStatusLabel, xrayCenterViewModel, ReferralService, FreeAccountService, FREE_ACCOUNT_STATUS_LABELS, formatFreeAccountDate, SupportService, CouponService, BroadcastService, BROADCAST_TARGET_LABELS, PaymentGatewayService, PaymentInvoiceService, maskApiKey, ProductGuideService, ForcedJoinService, PublicPlansService, productNotDeletedWhere, formatXrayBytes, maskToken, normalizeXrayStatus, XrayClientService, XrayPanelService, xrayTrafficSnapshot, XrayDiagnosticsService, accountSummaryMessage, errorMessage, walletSummaryMessage, formatToman, accountStatusLabel, divider, formatPageCount, formatStockLabel, formatUserLine, getPageParam, paymentStatusLabel, progressBar, purchasedAccountStatusLabel, resolveFreeAccountExpiry, shortId, walletStatusLabel, yesNoStatus, homeKeyboard, adminDashboardViewKeyboard, card, joinSections, section, sectionTitles, actionLabels, adminLabels, statusLabels, userLabels, uiIcons, MonitoringService, prisma, money, page, pages, userLine, stockLabel, freeAccountExpiry, yesNo };
export type { UiKeyboard, PaymentInvoiceStatus };
