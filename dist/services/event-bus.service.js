"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.eventBus = void 0;
const events_1 = require("events");
const logger_1 = require("./logger");
class EventBusService {
    constructor() {
        this.emitter = new events_1.EventEmitter();
    }
    on(eventName, handler) {
        this.emitter.on(eventName, (payload) => {
            Promise.resolve(handler(payload)).catch((error) => {
                logger_1.logger.error("Event handler failed", { eventName, error: error instanceof Error ? error.message : String(error) });
            });
        });
    }
    emit(eventName, payload) {
        logger_1.logger.info("Event emitted", { eventName, payload });
        this.emitter.emit(eventName, payload);
    }
}
exports.eventBus = new EventBusService();
