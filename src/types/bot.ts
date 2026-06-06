import type { Context, Telegraf } from "telegraf";

export type ConversationState =
  | { name: "deposit_amount" }
  | { name: "deposit_receipt"; depositId: string }
  | { name: "support_message"; ticketId: string }
  | { name: "coupon_code"; productId: string }
  | { name: "admin_coupon_create" }
  | { name: "admin_product_create" }
  | { name: "admin_account_create"; productId: string }
  | { name: "admin_ticket_reply"; ticketId: string }
  | { name: "admin_user_search" }
  | { name: "admin_product_search" };

export interface SessionData {
  state?: ConversationState;
  selectedCoupons?: Record<string, string>;
  adminFlow?: { flow: string; step: string; data: Record<string, unknown> };
}

export interface AppContext extends Context {
  session: SessionData;
}

export type AppBot = Telegraf<AppContext>;
