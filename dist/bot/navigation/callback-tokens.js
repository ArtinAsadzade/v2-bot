"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pruneCallbackTokens = pruneCallbackTokens;
exports.createCallbackToken = createCallbackToken;
exports.resolveCallbackToken = resolveCallbackToken;
exports.deleteCallbackToken = deleteCallbackToken;
exports.tokenAction = tokenAction;
const node_crypto_1 = require("node:crypto");
const panel_ui_1 = require("./panel-ui");
const CALLBACK_TOKEN_TTL_MS = 30 * 60 * 1000;
const MAX_CALLBACK_TOKENS = 80;
function now() {
    return Date.now();
}
function pruneCallbackTokens(ctx) {
    const tokens = ctx.session.callbackTokens;
    if (!tokens)
        return;
    const cutoff = now() - CALLBACK_TOKEN_TTL_MS;
    for (const [token, entry] of Object.entries(tokens)) {
        if (!entry || entry.createdAt < cutoff)
            delete tokens[token];
    }
    const entries = Object.entries(tokens).sort(([, a], [, b]) => b.createdAt - a.createdAt);
    for (const [token] of entries.slice(MAX_CALLBACK_TOKENS))
        delete tokens[token];
}
function createCallbackToken(ctx, type, payload) {
    var _a;
    pruneCallbackTokens(ctx);
    (_a = ctx.session).callbackTokens ?? (_a.callbackTokens = {});
    let token = (0, node_crypto_1.randomBytes)(6).toString("base64url");
    while (ctx.session.callbackTokens[token])
        token = (0, node_crypto_1.randomBytes)(6).toString("base64url");
    ctx.session.callbackTokens[token] = { type, payload, createdAt: now() };
    return token;
}
function resolveCallbackToken(ctx, type, token) {
    pruneCallbackTokens(ctx);
    const entry = ctx.session.callbackTokens?.[token];
    if (!entry || entry.type !== type)
        return null;
    return entry.payload;
}
function deleteCallbackToken(ctx, token) {
    if (ctx.session.callbackTokens)
        delete ctx.session.callbackTokens[token];
}
function tokenAction(prefix, token) {
    return (0, panel_ui_1.ensureCallbackData)(`${prefix}:${token}`);
}
