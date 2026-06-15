"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.auditLog = auditLog;
const logger_1 = require("./logger");
function errorMessage(error) {
    if (error === undefined || error === null)
        return undefined;
    return error instanceof Error ? error.message : String(error);
}
function auditLog(input) {
    const { area, action, status, entityId, error, metadata } = input;
    const meta = {
        area,
        action,
        status,
        ...(entityId === undefined || entityId === null ? {} : { entityId: String(entityId) }),
        ...metadata,
        ...(error === undefined ? {} : { error: errorMessage(error) }),
    };
    const message = `${area}.${action}.${status}`;
    if (status === "failed")
        logger_1.logger.error(message, meta);
    else if (status === "blocked")
        logger_1.logger.warn(message, meta);
    else
        logger_1.logger.info(message, meta);
}
