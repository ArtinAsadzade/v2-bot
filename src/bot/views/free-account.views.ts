import { registerView, callbackFor } from "../navigation/panel-ui";
import { FreeAccountService, formatFreeAccountDate } from "../../modules/free-account/free-account.service";
import { formatXrayBytes } from "../../modules/xray/xray.service";
import { card, joinSections, section } from "../ui/layout";
import { sectionTitles } from "../ui/sections";
import { userLabels } from "../ui/labels";
import { uiIcons } from "../ui/icons";
import { UserService } from "./admin/admin-helpers";

export function registerFreeAccountViews() {
  registerView("freeAccount", async (ctx) => {
    const user = ctx.from ? await UserService.getByTelegramId(ctx.from.id) : undefined;
    if (!user) return { text: "⚠️ پروفایل شما پیدا نشد. لطفاً /start را ارسال کنید.", keyboard: [] };
    const e = await FreeAccountService.xrayEligibility(user.id);
    const cfg = e.config;
    const blocked = !e.eligible;
    const reason = user.isBanned
      ? "حساب شما محدود شده است."
      : !cfg.enabled
        ? "اکانت تست فعلاً غیرفعال است."
        : e.active
          ? "شما یک اکانت تست فعال دارید."
          : e.nextAvailableAt && e.nextAvailableAt > new Date()
            ? "شما در ۳۰ روز گذشته اکانت تست دریافت کرده‌اید."
            : cfg.available <= 0
              ? "موجودی اکانت تست تکمیل شده است."
              : "آماده دریافت";
    return {
      replyKeyboard: "freeAccount",
      text: joinSections([
        card(userLabels.freeAccount, [
          `📌 وضعیت شما: ${reason}`,
          `📅 آخرین دریافت: ${formatFreeAccountDate(e.lastClaimAt)}`,
          `⏳ دریافت بعدی: ${formatFreeAccountDate(e.nextAvailableAt && e.nextAvailableAt > new Date() ? e.nextAvailableAt : undefined)}`,
        ]),
        section(sectionTitles.serviceSpecs, [
          `${uiIcons.product} موجودی: ${cfg.available.toLocaleString("fa-IR")} از ${cfg.stockLimit.toLocaleString("fa-IR")}`,
          `${sectionTitles.traffic}: ${formatXrayBytes(cfg.trafficBytes)}`,
          `${sectionTitles.duration}: ${cfg.durationDays.toLocaleString("fa-IR")} روز`,
        ]),
      ]),
      keyboard: blocked
        ? [[{ text: "📦 سرویس های من", action: callbackFor("services") }], [{ text: "🎫 پشتیبانی", action: callbackFor("support"), tone: "warning" }]]
        : [[{ text: "✅ دریافت اکانت تست", action: "freeAccount:claim" }]],
    };
  });
}
