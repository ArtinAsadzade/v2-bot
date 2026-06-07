"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resetFlow = resetFlow;
exports.setFlow = setFlow;
exports.getFlow = getFlow;
function resetFlow(ctx) {
    ctx.session.adminFlow = undefined;
}
function setFlow(ctx, flow) {
    ctx.session.adminFlow = flow;
}
function getFlow(ctx) {
    const flow = ctx.session.adminFlow;
    if (!flow || !isAdminFlowName(flow.flow))
        return undefined;
    return {
        flow: flow.flow,
        step: flow.step,
        data: normalizeFlowData(flow.data),
    };
}
function isAdminFlowName(value) {
    return value === "product_create" || value === "coupon_create" || value === "account_create" || value === "ticket_reply" || value === "category_create" || value === "category_edit" || value === "product_edit" || value === "account_edit" || value === "wallet_create" || value === "wallet_edit";
}
function normalizeFlowData(data) {
    return Object.fromEntries(Object.entries(data).filter((entry) => {
        const value = entry[1];
        return value === undefined || typeof value === "string" || typeof value === "number" || typeof value === "boolean";
    }));
}
