import type { Context, Telegraf } from "telegraf";
import type { ViewState } from "../bot/navigation/panel-ui";

export type ConversationState =
  | { name: "deposit_amount" }
  | { name: "deposit_receipt"; depositId: string }
  | { name: "support_message"; ticketId: string }
  | { name: "coupon_code"; productId: string }
  | { name: "admin_ticket_reply"; ticketId: string }
  | { name: "admin_user_search" }
  | { name: "admin_product_search" }
  | { name: "admin_category_search" }
  | { name: "admin_account_search" }
  | { name: "admin_wallet_search" };

export type FlowName =
  | "product_create"
  | "product_edit"
  | "account_create"
  | "account_edit"
  | "coupon_create"
  | "coupon_edit"
  | "deposit_submit"
  | "instant_topup"
  | "ticket_reply"
  | "coupon_code"
  | "product_search"
  | "wallet_adjust"
  | "free_account_create"
  | "free_account_edit"
  | "free_test_config"
  | "broadcast_create"
  | "category_create"
  | "category_edit"
  | "product_price"
  | "crypto_wallet_create"
  | "crypto_wallet_edit"
  | "minimum_topup"
  | "referral_tier_create"
  | "store_status"
  | "forced_join_create"
  | "product_guide_create"
  | "product_guide_edit"
  | "payment_gateway_update"
  | "payment_gateway_setup"
  | "xray_panel_setup"
  | "prediction_create"
  | "prediction_edit";

export interface ActiveFlow {
  name: FlowName;
  step: string;
  data: Record<string, string | number | boolean | undefined>;
  returnTo?: ViewState;
  draft?: {
    type: FlowName;
    id: string;
    currentStep: string;
    data: Record<string, string | number | boolean | undefined>;
    createdAt: string;
    updatedAt: string;
    expiresAt: string;
  };
}

export type CallbackTokenPayloadMap = {
  renewal: { xrayClientId: string; productId: string };
  xrayGroupSelect: { target: "free_test" | "product_create" | "product_edit"; selected: string | null; productId?: string };
  xrayPickerProduct: { target: "product_edit"; productId: string };
  predictionPick: { contestId: string; optionId: string };
  predictionClaim: { winnerId: string };
  predictionProductReward: { productId?: string; page?: number; categoryId?: string };
};
export type CallbackTokenType = keyof CallbackTokenPayloadMap;
export type CallbackTokenPayload<T extends CallbackTokenType = CallbackTokenType> = CallbackTokenPayloadMap[T];
export type CallbackTokenEntry<T extends CallbackTokenType = CallbackTokenType> = { type: T; payload: CallbackTokenPayload<T>; createdAt: number };

export interface SessionData {
  state?: ConversationState;
  selectedCoupons?: Record<string, string>;
  favoriteProducts?: Record<string, true>;
  recentlyViewedProductIds?: string[];
  productSearchQuery?: string;
  adminFlow?: { flow: string; step: string; data: Record<string, unknown> };
  liveTicketId?: string;
  liveTicketRole?: "user" | "admin";
  flow?: ActiveFlow;
  predictionCreate?: { title?: string; question?: string; description?: string; options?: string[]; rewardType?: "wallet" | "product"; rewardWalletAmount?: number; rewardProductId?: string; rewardProductTitle?: string; winnerCount?: number; closesAt?: string };
  predictionEdit?: { contestId: string; field: "title" | "question" | "description" | "winnerCount" | "reward" | "closesAt"; returnView?: string };
  dateTimePicker?: { flow: "prediction.create.closesAt" | "prediction.edit.closesAt"; returnView?: string; contestId?: string; selectedYear?: number; selectedMonth?: number; selectedDay?: number; selectedHour?: number; selectedMinute?: number };
  navigation?: { panelMessageId?: number; stack: ViewState[] };
  quickKeyboardSignature?: string;
  xrayPicker?: { target: "free_test" | "product_create" | "product_edit"; productId?: string; inboundOptions?: string; selectedIds?: number[]; groups?: string; returnTo?: ViewState };
  freeTestInboundSelection?: { inboundOptions: string; selectedIds: number[] };
  xrayBulkInbound?: { selectedProductIds: string[]; panelId?: string; inboundId?: number; inboundSnapshot?: string };
  callbackTokens?: Record<string, CallbackTokenEntry>;
}

export interface AppContext extends Context {
  session: SessionData;
  startPayload?: string;
}

export type AppBot = Telegraf<AppContext>;
