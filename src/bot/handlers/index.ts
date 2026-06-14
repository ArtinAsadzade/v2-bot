import type { AppBot } from "../../types/bot";
import { registerModernHandlers } from "./modern";
import { registerForcedJoinEventHandlers } from "./forced-join-events";

export function registerHandlers(bot: AppBot) {
  registerForcedJoinEventHandlers(bot);
  registerModernHandlers(bot);
}
