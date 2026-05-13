export type AuditActor = { id: string; type: 'user' | 'admin' | 'system' };

export type AuditLogInput = {
  actor?: AuditActor;
  action: string;
  entity: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
};

export interface AuditLogPort {
  record(input: AuditLogInput): Promise<void>;
}
