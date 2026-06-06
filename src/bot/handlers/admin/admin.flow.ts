export type AdminFlowName = "product_create" | "coupon_create" | "account_create" | "ticket_reply";

export interface AdminFlowState {
  flow: AdminFlowName;
  step: string;
  data: Record<string, any>;
}

export function resetFlow(ctx: any) {
  ctx.session.adminFlow = undefined;
}

export function setFlow(ctx: any, flow: AdminFlowState) {
  ctx.session.adminFlow = flow;
}

export function getFlow(ctx: any): AdminFlowState | undefined {
  return ctx.session.adminFlow;
}
