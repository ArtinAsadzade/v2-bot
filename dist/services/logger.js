"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
function format(meta) {
    return meta ? ` ${JSON.stringify(meta)}` : "";
}
exports.logger = {
    info: (message, meta) => console.log(`[INFO] ${message}${format(meta)}`),
    warn: (message, meta) => console.warn(`[WARN] ${message}${format(meta)}`),
    error: (message, meta) => console.error(`[ERROR] ${message}${format(meta)}`),
    debug: (message, meta) => console.log(`[DEBUG] ${message}${format(meta)}`),
};
