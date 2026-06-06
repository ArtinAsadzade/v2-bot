"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rateLimit = rateLimit;
const cache = new Map();
function rateLimit(userId, windowMs = 1000) {
    const now = Date.now();
    const last = cache.get(userId);
    if (last && now - last < windowMs) {
        return false;
    }
    cache.set(userId, now);
    return true;
}
