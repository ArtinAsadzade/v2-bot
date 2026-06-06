import type { Context, SessionFlavor, Telegraf } from "telegraf";

export type ConversationState =
  | { name: "deposit_amount" }
  | { name: "deposit_receipt"; depositId: string }
  | { name: "support_message"; ticketId: string }
  | { name: "coupon_code"; productId: string }
  | { name: "admin_coupon_create" }
  | { name: "admin_product_create" }
  | { name: "admin_account_create"; productId: string }
  | { name: "admin_ticket_reply"; ticketId: string };

export interface SessionData {
  state?: ConversationState;
}

export type AppContext = Context & SessionFlavor<SessionData>;
export type AppBot = Telegraf<AppContext>;
