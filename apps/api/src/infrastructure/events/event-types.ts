import type { SystemEventType } from '@prisma/client';

export type DomainEventPayload = Record<string, unknown>;

export type DomainEvent = {
  type: SystemEventType;
  idempotencyKey: string;
  aggregateType?: string;
  aggregateId?: string;
  payload: DomainEventPayload;
};

export type EventHandler = (event: DomainEvent) => Promise<void>;
