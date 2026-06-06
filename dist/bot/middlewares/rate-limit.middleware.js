"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rateLimit = rateLimit;
const cache = new Map();
function rateLimit(userId) {
    const now = Date.now();
    const last = cache.get(userId);
    if (last && now - last < 1000) {
        return false;
    }
    cache.set(userId, now);
    return true;
}
