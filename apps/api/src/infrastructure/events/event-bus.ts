import { SystemEventStatus } from '@prisma/client';

import { logger } from '../../core/logger/logger.js';
import { prisma } from '../prisma/client.js';

import type { DomainEvent, EventHandler } from './event-types.js';
import type { SystemEventType } from '@prisma/client';

/**
 * Replay-safe internal event bus: persists events before dispatch.
 */
export class EventBus {
  private readonly handlers = new Map<SystemEventType, EventHandler[]>();

  public on(type: SystemEventType, handler: EventHandler): void {
    const list = this.handlers.get(type) ?? [];
    list.push(handler);
    this.handlers.set(type, list);
  }

  public async emit(event: DomainEvent): Promise<void> {
    const stored = await prisma.systemEvent.upsert({
      where: { idempotencyKey: event.idempotencyKey },
      update: {},
      create: {
        type: event.type,
        idempotencyKey: event.idempotencyKey,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        payload: event.payload as never,
        status: SystemEventStatus.PENDING,
      },
    });
    if (stored.status === SystemEventStatus.PROCESSED) return;

    const handlers = this.handlers.get(event.type) ?? [];
    try {
      for (const handler of handlers) {
        await handler(event);
      }
      await prisma.systemEvent.update({
        where: { id: stored.id },
        data: { status: SystemEventStatus.PROCESSED, processedAt: new Date() },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown event handler error';
      await prisma.systemEvent.update({
        where: { id: stored.id },
        data: { status: SystemEventStatus.FAILED, failureReason: message },
      });
      logger.error({ eventType: event.type, error: message }, 'event handler failed');
      throw error;
    }
  }
}

export const eventBus = new EventBus();
