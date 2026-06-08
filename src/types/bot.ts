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

export type FlowName = "product_create" | "account_create" | "coupon_create" | "coupon_edit" | "deposit_submit" | "ticket_reply" | "coupon_code" | "product_search" | "wallet_adjust" | "free_account_create" | "free_account_edit" | "product_price" | "crypto_wallet_create" | "minimum_topup" | "referral_tier_create" | "store_status" | "forced_join_create";

export interface ActiveFlow {
  name: FlowName;
  step: string;
  data: Record<string, string | number | boolean | undefined>;
  returnTo?: ViewState;
}

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
  navigation?: { panelMessageId?: number; stack: ViewState[] };
}

export interface AppContext extends Context {
  session: SessionData;
  startPayload?: string;
}

export type AppBot = Telegraf<AppContext>;
