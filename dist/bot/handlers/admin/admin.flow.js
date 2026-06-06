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
    return ctx.session.adminFlow;
}
