import { registerView } from "../navigation/panel-ui";
import { UserService } from "../../modules/user/user.service";
import { SupportService } from "../../modules/support/support.service";
import { shortId } from "../../utils/formatters";
import { card, joinSections, section } from "../ui/layout";
import { statusLabels, userLabels } from "../ui/labels";
import { uiIcons } from "../ui/icons";

export function registerSupportViews() {
  registerView("support", async (ctx) => {
    const user = ctx.from ? await UserService.getByTelegramId(ctx.from.id) : undefined;
    if (!user) return { text: "⚠️ پروفایل شما پیدا نشد. لطفاً /start را ارسال کنید.", keyboard: [] };
    const tickets = await SupportService.listUserTickets(user.id);
    const latestOpen = tickets.find((ticket) => ticket.status === "open");
    return {
      replyKeyboard: "support",
      text: joinSections([
        card(userLabels.support, [
          "از این بخش می‌توانید با پشتیبانی در ارتباط باشید، تیکت جدید ثبت کنید یا وضعیت تیکت‌های قبلی خود را ببینید.",
          `📌 آخرین تیکت باز: ${latestOpen ? `#${shortId(latestOpen.id)}` : "ندارید"}`,
        ]),
        section(`${uiIcons.invoice} تیکت‌های اخیر`, [
          tickets
            .map(
              (ticket) =>
                `• #${shortId(ticket.id)} · ${ticket.status === "open" ? statusLabels.active : "🔒 بسته"} · ${ticket.updatedAt.toLocaleString("fa-IR")}\n  ${ticket.messages[0]?.message ?? "بدون پیام"}`,
            )
            .join("\n") || "هنوز تیکتی ثبت نشده است.",
        ]),
      ]),
      keyboard: [[{ text: "✉️ ثبت تیکت جدید", action: "support:chat:start", tone: "success" }]],
    };
  });
}
