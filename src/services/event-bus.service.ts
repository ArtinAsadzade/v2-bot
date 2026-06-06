import { EventEmitter } from "events";
import { logger } from "./logger";

export type AppEventMap = {
  "user.created": { userId: string; telegramId: string; referralCode?: string | null };
  "deposit.created": { depositId: string; userId: string; amount: number; cryptoType: string; wallet: string; networkName?: string | null };
  "deposit.receipt.submitted": { depositId: string; userId: string; amount: number; cryptoType: string; receipt: string };
  "deposit.approved": { depositId: string; userId: string; amount: number; adminTelegramId: string };
  "deposit.rejected": { depositId: string; userId: string; adminTelegramId: string };
  "ticket.created": { ticketId: string; userId: string; telegramId: string };
  "ticket.message.created": { ticketId: string; userId: string; senderRole: "user" | "admin"; message: string };
  "ticket.closed": { ticketId: string; userId: string; adminTelegramId: string };
  "referral.created": { referralId: string; referrerId: string; referredId: string };
  "referral.earned": { referrerId: string; referredId: string; referralCount: number };
  "referral.reward.claimed": { rewardId: string; userId: string; amount: number };
  "coupon.applied": { couponId: string; code: string; userId: string; orderId: string; discountAmount: number };
  "free_config.claimed": { rewardId: string; userId: string; config: string };
  "free_account.assigned": { userId: string; productId: string; accountId: string; reason: string };
  "order.created": { orderId: string; userId: string; productId: string; totalAmount: number };
  "order.completed": { orderId: string; userId: string; productId: string; totalAmount: number };
};

type EventName = keyof AppEventMap;
type EventHandler<T extends EventName> = (payload: AppEventMap[T]) => Promise<void> | void;

class EventBusService {
  private emitter = new EventEmitter();

  on<T extends EventName>(eventName: T, handler: EventHandler<T>) {
    this.emitter.on(eventName, (payload: AppEventMap[T]) => {
      Promise.resolve(handler(payload)).catch((error) => {
        logger.error("Event handler failed", { eventName, error: error instanceof Error ? error.message : String(error) });
      });
    });
  }

  emit<T extends EventName>(eventName: T, payload: AppEventMap[T]) {
    logger.info("Event emitted", { eventName, payload });
    this.emitter.emit(eventName, payload);
  }
}

export const eventBus = new EventBusService();
