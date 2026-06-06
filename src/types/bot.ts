import type { Context, Telegraf } from "telegraf";
import type { ViewState } from "../bot/navigation/panel-ui";

export type ConversationState =
  | { name: "deposit_amount" }
  | { name: "deposit_receipt"; depositId: string }
  | { name: "support_message"; ticketId: string }
  | { name: "coupon_code"; productId: string }
  | { name: "admin_ticket_reply"; ticketId: string }
  | { name: "admin_user_search" }
  | { name: "admin_product_search" };

export type FlowName = "product_create" | "account_create" | "coupon_create" | "deposit_submit" | "ticket_reply" | "coupon_code" | "wallet_adjust" | "free_account_create" | "product_price" | "crypto_wallet_create" | "minimum_topup";

export interface ActiveFlow {
  name: FlowName;
  step: string;
  data: Record<string, string | number | boolean | undefined>;
  returnTo?: ViewState;
}

export interface SessionData {
  state?: ConversationState;
  selectedCoupons?: Record<string, string>;
  adminFlow?: { flow: string; step: string; data: Record<string, unknown> };
  liveTicketId?: string;
  flow?: ActiveFlow;
  navigation?: { panelMessageId?: number; stack: ViewState[] };
}

export interface AppContext extends Context {
  session: SessionData;
  startPayload?: string;
}

export type AppBot = Telegraf<AppContext>;
