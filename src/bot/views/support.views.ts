import { registerView } from "../navigation/panel-ui";
import { UserService } from "../../modules/user/user.service";
import { SupportService } from "../../modules/support/support.service";
import { shortId } from "../../utils/formatters";
import { navRow } from "../keyboards/panel-keyboard.helpers";
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
      keyboard: [
        navRow({ text: "✉️ ثبت تیکت جدید", view: "support.new" }),
        navRow({ text: "📋 تیکت‌های من", view: "support.tickets" }, { text: "💬 گفتگو با پشتیبانی", view: "support.contact" }),
        navRow(
          { text: "💳 مشکل پرداخت", view: "support.payment", tone: "danger" },
          { text: "📡 مشکل اتصال", view: "support.connection", tone: "danger" },
        ),
      ],
    };
  });
  registerView("support.tickets", async (ctx) => {
    const user = ctx.from ? await UserService.getByTelegramId(ctx.from.id) : undefined;
    if (!user) return { text: "⚠️ پروفایل شما پیدا نشد.", keyboard: [] };
    const tickets = await SupportService.listUserTickets(user.id);
    return {
      text: card("📋 تیکت‌های من", [
        tickets.length
          ? tickets.map((ticket) => `#${shortId(ticket.id)} · ${ticket.status === "open" ? "باز" : "بسته"}`).join("\n")
          : "تیکتی ثبت نشده است.",
      ]),
      keyboard: tickets.slice(0, 5).map((ticket) => [{ text: `👁 تیکت #${shortId(ticket.id)}`, action: `support:chat:${ticket.id}` }]),
    };
  });
  registerView("support.new", async () => ({
    text: card("✉️ ثبت تیکت جدید", ["برای ارتباط با پشتیبانی، گفتگو را شروع کنید و پیام خود را ارسال کنید."]),
    keyboard: [[{ text: "✉️ شروع گفتگو با پشتیبانی", action: "support:chat:start" }]],
  }));

  registerView("support.connection", async () => ({
    text: card("📡 مشکل اتصال", [
      "اگر سرویس شما وصل نمی‌شود، ابتدا اشتراک را به‌روزرسانی کنید.",
      "اگر مشکل ادامه داشت، برای بررسی دقیق‌تر تیکت ثبت کنید.",
    ]),
    keyboard: [[{ text: "📡 ثبت تیکت مشکل اتصال", action: "support:chat:start" }]],
  }));

  registerView("support.payment", async () => ({
    text: card("💳 مشکل پرداخت", ["برای پیگیری پرداخت، لطفاً رسید یا شناسه تراکنش را ارسال کنید."]),
    keyboard: [[{ text: "💳 ثبت تیکت مشکل پرداخت", action: "support:chat:start" }]],
  }));

  registerView("support.contact", async () => ({
    text: card("💬 ارتباط با پشتیبانی", ["پیام خود را ارسال کنید؛ پاسخ پشتیبانی در همین چت نمایش داده می‌شود."]),
    keyboard: [[{ text: "💬 شروع گفتگو با پشتیبانی", action: "support:chat:start" }]],
  }));
}
