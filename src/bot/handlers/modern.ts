import type { AppBot } from "../../types/bot";
import { registerModernHandlers as registerModernHandlerModules } from "./modern/register-modern-handlers";

export function registerModernHandlers(bot: AppBot) {
  registerModernHandlerModules(bot);
}
