import type { AppBot } from "../../types/bot";
import { registerModernHandlers } from "./modern";

export function registerHandlers(bot: AppBot) {
  registerModernHandlers(bot);
}
