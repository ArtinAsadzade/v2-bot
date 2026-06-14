"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerHandlers = registerHandlers;
const modern_1 = require("./modern");
const forced_join_events_1 = require("./forced-join-events");
function registerHandlers(bot) {
    (0, forced_join_events_1.registerForcedJoinEventHandlers)(bot);
    (0, modern_1.registerModernHandlers)(bot);
}
