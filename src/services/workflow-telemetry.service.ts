import type { FlowName } from "../types/bot";
import { logger } from "./logger";

export type WorkflowTelemetryEventType = "started" | "advanced" | "completed" | "cancelled" | "failed" | "recovered" | "expired";

export type WorkflowTelemetryEvent = {
  type: WorkflowTelemetryEventType;
  flow: FlowName | string;
  step?: string;
  draftId?: string;
  telegramId?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
};

const events: WorkflowTelemetryEvent[] = [];
const MAX_EVENTS = 1_000;

export class WorkflowTelemetryService {
  static record(input: Omit<WorkflowTelemetryEvent, "createdAt">) {
    const event: WorkflowTelemetryEvent = { ...input, createdAt: new Date() };
    events.unshift(event);
    if (events.length > MAX_EVENTS) events.length = MAX_EVENTS;
    logger.info("WORKFLOW_TELEMETRY", event);
  }

  static recent(limit = 50) {
    return events.slice(0, limit);
  }

  static stats() {
    const byFlow: Record<string, Record<WorkflowTelemetryEventType, number>> = {};
    for (const event of events) {
      byFlow[event.flow] ??= { started: 0, advanced: 0, completed: 0, cancelled: 0, failed: 0, recovered: 0, expired: 0 };
      byFlow[event.flow][event.type] += 1;
    }
    return { total: events.length, byFlow };
  }

  static clearForTests() {
    events.length = 0;
  }
}
