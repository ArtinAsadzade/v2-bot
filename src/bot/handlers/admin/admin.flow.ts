import type { AppContext } from "../../../types/bot";

export type AdminFlowName = "product_create" | "coupon_create" | "account_create" | "ticket_reply" | "category_create" | "category_edit" | "product_edit" | "account_edit" | "wallet_create" | "wallet_edit" | "product_field_edit";

export interface AdminFlowState {
  flow: AdminFlowName;
  step: string;
  data: Record<string, string | number | boolean | undefined>;
}

export function resetFlow(ctx: AppContext): void {
  ctx.session.adminFlow = undefined;
}

export function setFlow(ctx: AppContext, flow: AdminFlowState): void {
  ctx.session.adminFlow = flow;
}

export function getFlow(ctx: AppContext): AdminFlowState | undefined {
  const flow = ctx.session.adminFlow;
  if (!flow || !isAdminFlowName(flow.flow)) return undefined;

  flow.data = normalizeFlowData(flow.data);
  return flow as AdminFlowState;
}

function isAdminFlowName(value: string): value is AdminFlowName {
  return value === "product_create" || value === "coupon_create" || value === "account_create" || value === "ticket_reply" || value === "category_create" || value === "category_edit" || value === "product_edit" || value === "account_edit" || value === "wallet_create" || value === "wallet_edit" || value === "product_field_edit";
}

function normalizeFlowData(data: Record<string, unknown>): Record<string, string | number | boolean | undefined> {
  return Object.fromEntries(
    Object.entries(data).filter((entry): entry is [string, string | number | boolean | undefined] => {
      const value = entry[1];
      return value === undefined || typeof value === "string" || typeof value === "number" || typeof value === "boolean";
    }),
  );
}
