import type { AppBot } from "../../../types/bot";
import { registerAdminDomainHandlers } from "./admin";

export function registerAdminHandlers(bot: AppBot) {
  registerAdminDomainHandlers(bot);
}
