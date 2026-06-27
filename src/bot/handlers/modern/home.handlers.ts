import type { AppBot, AppContext } from "../../../types/bot";
import { goBack, parseNavAction, renderPanel, callbackFor, actionFor, RenderMode } from "../../navigation/panel-ui";
import { UserService } from "../../../modules/user/user.service";
import { ReferralService } from "../../../modules/referral/referral.service";
import { isAdminByTelegramId } from "../../middlewares/admin.middleware";
import { adminOnlyCommandMessage, publicPlansDisabledInGroupsMessage } from "../../messages/common.messages";
import { PublicPlansService } from "../../../modules/product/public-plans.service";

export function registerHomeHandlers(bot: AppBot) {
  const publicPlansCooldown = new Map<number, number>();
  async function handlePublicPlansCommand(ctx: AppContext) {
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    const isPrivate = ctx.chat?.type === "private";
    if (isPrivate) {
      await renderPanel(ctx, { id: "shop" }, "replace");
      return;
    }
    const setting = await PublicPlansService.getSetting();
    if (!setting.enabled) {
      if (isPrivate) await ctx.reply(publicPlansDisabledInGroupsMessage());
      return;
    }
    const now = Date.now();
    if (!isPrivate && (publicPlansCooldown.get(chatId) ?? 0) > now - 60_000) return;
    publicPlansCooldown.set(chatId, now);
    const categories = await PublicPlansService.listPublicPlans();
    const botInfo = await ctx.telegram.getMe();
    const planLines = categories
      .map(
        (category) =>
          `📂 ${category.name}\n\n${category.products
            .map((product) => {
              const duration = product.mode === "xray_auto" ? (product.durationDays ?? product.duration) : product.duration;
              const traffic =
                product.mode === "xray_auto" && product.trafficBytes
                  ? `\nحجم: ${(Number(product.trafficBytes) / 1_073_741_824).toLocaleString("fa-IR")} GB`
                  : "";
              return `▫️ ${product.title}${traffic}\nمدت: ${duration.toLocaleString("fa-IR")} روز\nقیمت: ${product.price.toLocaleString("fa-IR")} تومان\nموجودی: ${product.availableStock.toLocaleString("fa-IR")}`;
            })
            .join("\n\n")}`,
      )
      .join("\n\n━━━━━━━━━━━━━━\n\n");
    const text = `🛒 پلن‌های فعال فروشگاه\n\n━━━━━━━━━━━━━━\n\n${planLines || "در حال حاضر پلن آماده فروشی وجود ندارد."}\n\n━━━━━━━━━━━━━━\nبرای خرید و مشاهده جزئیات، وارد ربات شوید.`;
    await ctx.reply(text.slice(0, 3900), {
      reply_markup: { inline_keyboard: [[{ text: "🛒 خرید سرویس", url: `https://t.me/${botInfo.username}?start=shop` }]] },
    });
  }

  bot.command(["plans", "plan", "products"], handlePublicPlansCommand);

  const userCommands: Array<[string | string[], Parameters<typeof renderPanel>[1]]> = [
    ["menu", { id: "home" }],
    ["shop", { id: "shop" }],
    ["wallet", { id: "wallet" }],
    ["accounts", { id: "account.details" }],
    ["support", { id: "support" }],
    [["help", "guide"], { id: "productGuide" }],
    ["referral", { id: "referral" }],
  ];

  for (const [command, state] of userCommands) {
    bot.command(command, async (ctx) => {
      await renderPanel(ctx, state, "replace");
    });
  }

  const adminCommands: Array<[string, Parameters<typeof renderPanel>[1]]> = [
    ["admin", { id: "admin.dashboard" }],
    ["store", { id: "admin.store" }],
    ["finance", { id: "admin.finance" }],
    ["payments", { id: "admin.finance" }],
    ["tickets", { id: "admin.tickets" }],
    ["settings", { id: "admin.botSettings" }],
    ["monitoring", { id: "admin.monitoring" }],
    ["stats", { id: "admin.analytics" }],
  ];

  for (const [command, state] of adminCommands) {
    bot.command(command, async (ctx) => {
      if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) {
        await ctx.reply(adminOnlyCommandMessage());
        return;
      }
      await renderPanel(ctx, state, "replace");
    });
  }

  bot.start(async (ctx) => {
    if (!ctx.from) return;
    const user = await UserService.findOrCreateUser(ctx);
    const payload = ctx.startPayload;
    if (payload === "shop") {
      await renderPanel(ctx, { id: "shop" }, "replace");
      return;
    }
    if (payload) await ReferralService.linkReferral(user.id, payload);
    await renderPanel(ctx, { id: "home" }, "replace");
  });
}
