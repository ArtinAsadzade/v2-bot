import type { AppBot, AppContext } from "../../../../types/bot";
import { registerModernViews } from "../../../views/modern.views";
import { goBack, parseNavAction, renderPanel, callbackFor, actionFor, RenderMode } from "../../../navigation/panel-ui";
import { createCallbackToken, resolveCallbackToken, tokenAction } from "../../../navigation/callback-tokens";
import { registerFlowEngine, handleActiveFlowPhoto, handleActiveFlowText, startFlow } from "../../../flows/flow-engine";
import { UserService } from "../../../../modules/user/user.service";
import { ReferralService } from "../../../../modules/referral/referral.service";
import { PurchaseService } from "../../../../modules/product/purchase.service";
import { ProductService } from "../../../../modules/product/product.service";
import { CryptoWalletService, DepositService } from "../../../../modules/deposit/deposit.service";
import { AdminService } from "../../../../modules/admin/admin.service";
import { CouponService } from "../../../../modules/coupon/coupon.service";
import { SupportService } from "../../../../modules/support/support.service";
import {
  FreeAccountError,
  FreeAccountService,
  FREE_ACCOUNT_STATUS_LABELS,
  formatFreeAccountError,
  formatFreeAccountDate,
  freeAccountExpiresAt,
} from "../../../../modules/free-account/free-account.service";
import { PaymentGatewayService, PaymentInvoiceService } from "../../../../modules/payment/payment.service";
import { isAdminByTelegramId } from "../../../middlewares/admin.middleware";
import { quickReplyTarget } from "../../../keyboards/reply.keyboard";
import { InvoiceActionKeyboard } from "../../../keyboards/design-system";
import { supportCloseHomeInlineKeyboard } from "../../../keyboards/common.keyboard";
import { adminDangerConfirmKeyboard } from "../../../keyboards/admin-danger.keyboard";
import { adminDangerConfirmMessage } from "../../../messages/admin.messages";
import { xraySubscriptionKeyboard, xrayConfigsSentKeyboard, xrayRenewedKeyboard, xrayRenewalInvoiceKeyboard } from "../../../keyboards/account.keyboard";
import { accountHomeInlineKeyboard, expiredCheckoutRecoveryKeyboard, pendingInvoiceRecoveryKeyboard, processingPurchaseRecoveryKeyboard, standardPurchaseDeliveryKeyboard, xrayPurchaseDeliveryKeyboard } from "../../../keyboards/purchase.keyboard";
import { buyCallbacks, nav, xrayCallbacks } from "../../../callbacks";
import { pendingInvoiceExistsMessage, previousPurchaseProcessingMessage, unauthorizedMessage } from "../../../messages/purchase.messages";
import { serviceNotFoundMessage, xrayConfigsSentMessage, xrayRenewalInvoiceMessage, xrayRenewedMessage, xraySubscriptionMessage } from "../../../messages/account.messages";
import { adminOnlyCommandMessage, publicPlansDisabledInGroupsMessage } from "../../../messages/common.messages";
import { couponApplyFromProductMessage, couponRemovedMessage } from "../../../messages/coupon.messages";
import { purchaseSuccessMessage } from "../../../../utils/messages";
import { MonitoringService } from "../../../../services/monitoring.service";
import { ProductGuideService } from "../../../../modules/system/product-guide.service";
import { PublicPlansService } from "../../../../modules/product/public-plans.service";
import { XrayClientService, XrayPanelService, xrayInboundSnapshot } from "../../../../modules/xray/xray.service";
import { prisma } from "../../../../services/prisma";
import { withTimeout } from "../../../../utils/async";

export function registerAdminInventoryHandlers(bot: AppBot) {
  function freeTestInboundKeyboard(inbounds: Awaited<ReturnType<typeof XrayClientService.listInbounds>>, selectedIds: number[]) {
    const selected = new Set(selectedIds);
    const rows = inbounds.map((inbound) => [
      {
        text: `${selected.has(inbound.id) ? "☑" : "☐"} ${inbound.remark ?? inbound.tag ?? `inbound-${inbound.id}`} | ${inbound.protocol ?? "—"} · port ${inbound.port ?? "—"}`,
        callback_data: `admin:free_test:inbound:toggle:${inbound.id}`,
      },
    ]);
    rows.push([{ text: "✅ ذخیره اینباندها", callback_data: "admin:free_test:inbounds:save" }]);
    rows.push([
      { text: "🔄 بروزرسانی لیست", callback_data: "admin:free_test:inbounds" },
      { text: "🔙 بازگشت", callback_data: callbackFor("admin.freeAccounts") },
    ]);
    return { inline_keyboard: rows };
  }

  async function showFreeTestInboundSelector(ctx: AppContext) {
    const [cfg, inbounds] = await Promise.all([FreeAccountService.getXrayConfig(), XrayClientService.listInbounds()]);
    const selectedIds = cfg.inboundIds.filter((id) => inbounds.some((inbound) => inbound.id === id));
    ctx.session.freeTestInboundSelection = { inboundOptions: JSON.stringify(inbounds), selectedIds };
    const selected = new Set(selectedIds);
    await ctx.reply(
      `🔗 انتخاب اینباندهای اکانت تست\n\n${inbounds.map((i) => `${selected.has(i.id) ? "☑" : "☐"} ${i.remark ?? i.tag ?? `inbound-${i.id}`} | ${i.protocol ?? "—"}\n${i.protocol ?? "—"} · port ${i.port ?? "—"}`).join("\n\n") || "⚠️ هیچ اینباند زنده‌ای از پنل دریافت نشد."}`,
      { reply_markup: freeTestInboundKeyboard(inbounds, selectedIds) },
    );
  }

  bot.action("admin:xray:test", async (ctx) => {
    await ctx.answerCbQuery().catch(() => undefined);
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return;
    const loading = await ctx.reply("⏳ در حال تست اتصال پنل Xray...");
    const result = await withTimeout(XrayPanelService.testConnection(), 15_000).catch((error) => ({ ok: false as const, error: error instanceof Error ? error.message : "timeout", inboundCount: 0 }));
    await ctx.telegram
      .editMessageText(
        loading.chat.id,
        loading.message_id,
        undefined,
        result.ok
          ? `✅ اتصال موفق\nتعداد اینباندها: ${result.inboundCount.toLocaleString("fa-IR")}`
          : `⚠️ اطلاعات لحظه‌ای پنل در دسترس نیست؛ اطلاعات ذخیره‌شده نمایش داده شد.\n${result.error}`,
      )
      .catch(() => undefined);
    await renderPanel(ctx, { id: "admin.xraySettings" }, "replace");
  });

  const pickerTargetAlias = { free_test: "f", product_create: "pc", product_edit: "pe" } as const;
  const pickerTargetFromAlias = { f: "free_test", pc: "product_create", pe: "product_edit" } as const;
  type XrayPickerTargetAlias = keyof typeof pickerTargetFromAlias;
  const pickerAlias = (target: "free_test" | "product_create" | "product_edit") => pickerTargetAlias[target];

  function resolvePickerProductId(ctx: AppContext, productOrToken?: string): string | undefined {
    if (!productOrToken) return undefined;
    return resolveCallbackToken(ctx, "xrayPickerProduct", productOrToken)?.productId ?? productOrToken;
  }

  function isExpiredPickerToken(ctx: AppContext, targetAlias: string, productOrToken?: string): boolean {
    if (targetAlias !== "pe" || !productOrToken) return false;
    if (/^[a-f\d]{24}$/i.test(productOrToken)) return false;
    return !resolveCallbackToken(ctx, "xrayPickerProduct", productOrToken);
  }

  async function replyExpiredPickerToken(ctx: AppContext) {
    await ctx.reply("⚠️ این دکمه منقضی شده است. لطفاً صفحه محصول را دوباره باز کنید و لیست را بروزرسانی کنید.");
  }

  function xrayInboundPickerKeyboard(
    ctxForKeyboard: AppContext,
    target: "free_test" | "product_create" | "product_edit",
    inbounds: Awaited<ReturnType<typeof XrayClientService.listInbounds>>,
    selectedIds: number[],
    productId?: string,
  ) {
    const selected = new Set(selectedIds);
    const targetAlias = pickerAlias(target);
    const token =
      target === "product_edit" && productId
        ? createCallbackToken(ctxForKeyboard, "xrayPickerProduct", { target: "product_edit", productId })
        : undefined;
    const suffix = productId ? `:${token ?? productId}` : "";
    const rows = inbounds.map((inbound) => [
      {
        text: `${selected.has(inbound.id) ? "☑" : "☐"} ${inbound.remark ?? inbound.tag ?? `inbound-${inbound.id}`} | ${inbound.protocol ?? "—"} · port ${inbound.port ?? "—"}`,
        callback_data: `xpi:t:${targetAlias}:${inbound.id}${suffix}`,
      },
    ]);
    rows.push([{ text: "✅ ذخیره اینباندها", callback_data: `xpi:s:${targetAlias}${suffix}` }]);
    rows.push([
      { text: "🔄 بروزرسانی لیست", callback_data: `xpi:l:${targetAlias}${suffix}` },
      {
        text: "🔙 بازگشت",
        callback_data:
          target === "free_test"
            ? callbackFor("admin.freeAccounts")
            : productId
              ? callbackFor("admin.product", { productId })
              : callbackFor("admin.products"),
      },
    ]);
    return { inline_keyboard: rows };
  }

  async function showXrayInboundPicker(ctx: AppContext, target: "free_test" | "product_create" | "product_edit", productId?: string) {
    const inbounds = await XrayClientService.listInbounds();
    let selectedIds: number[] = [];
    if (target === "free_test") selectedIds = (await FreeAccountService.getXrayConfig()).inboundIds;
    if (target === "product_edit" && productId) selectedIds = (await AdminService.productDetail(productId)).product?.inboundIds ?? [];
    if (target === "product_create") selectedIds = (ctx.session.flow?.data.inboundIds as number[] | undefined) ?? [];
    selectedIds = selectedIds.filter((id) => inbounds.some((inbound) => inbound.id === id));
    ctx.session.xrayPicker = { target, productId, inboundOptions: JSON.stringify(inbounds), selectedIds };
    const selected = new Set(selectedIds);
    const title = target === "free_test" ? "اکانت تست" : target === "product_edit" ? "محصول" : "محصول جدید";
    await ctx.reply(
      `🔗 انتخاب اینباندهای ${title}\n\n${target === "product_edit" ? "⚠️ تغییر اینباندها فقط روی خریدهای جدید اعمال می‌شود.\n\n" : ""}${inbounds.map((i) => `${selected.has(i.id) ? "☑" : "☐"} ${i.remark ?? i.tag ?? `inbound-${i.id}`}\n${i.protocol ?? "—"} · port ${i.port ?? "—"}`).join("\n\n") || "⚠️ هیچ اینباند زنده‌ای از پنل دریافت نشد."}`,
      { reply_markup: xrayInboundPickerKeyboard(ctx, target, inbounds, selectedIds, productId) },
    );
  }

  async function showXrayGroupPicker(ctx: AppContext, target: "free_test" | "product_create" | "product_edit", productId?: string) {
    const groups = await XrayClientService.listGroups();
    ctx.session.xrayPicker = { target, productId, groups: JSON.stringify(groups) };
    const targetAlias = pickerAlias(target);
    const refreshToken =
      target === "product_edit" && productId ? createCallbackToken(ctx, "xrayPickerProduct", { target: "product_edit", productId }) : undefined;
    const refreshSuffix = productId ? `:${refreshToken ?? productId}` : "";
    const noneToken = createCallbackToken(ctx, "xrayGroupSelect", { target, selected: null, productId });
    const rows = [
      [{ text: "بدون گروه", callback_data: tokenAction("xpg:s", noneToken) }],
      ...groups.map((g) => {
        const selectToken = createCallbackToken(ctx, "xrayGroupSelect", { target, selected: g.name, productId });
        return [{ text: `${g.name} (${g.clientCount ?? 0})`, callback_data: tokenAction("xpg:s", selectToken) }];
      }),
      [
        { text: "🔄 بروزرسانی گروه‌ها", callback_data: `xpg:l:${targetAlias}${refreshSuffix}` },
        {
          text: "🔙 بازگشت",
          callback_data:
            target === "free_test"
              ? callbackFor("admin.freeAccounts")
              : productId
                ? callbackFor("admin.product", { productId })
                : callbackFor("admin.products"),
        },
      ],
    ];
    await ctx.reply(
      `👥 انتخاب گروه کلاینت\n\n${target === "product_edit" ? "⚠️ تغییر گروه فقط روی خریدهای جدید اعمال می‌شود.\n\n" : ""}${groups.length ? groups.map((g) => `• ${g.name} (${g.clientCount ?? 0})`).join("\n") : "گروهی در پنل تعریف نشده است.\nمی‌توانید «بدون گروه» را انتخاب کنید."}`,
      { reply_markup: { inline_keyboard: rows } },
    );
  }

  async function completeProductCreateFromPicker(ctx: AppContext) {
    const flow = ctx.session.flow;
    if (!flow || flow.name !== "product_create") throw new Error("فرم ساخت محصول فعال نیست");
    const categoryId = String(flow.data.categoryId ?? "");
    if (!categoryId) throw new Error("دسته‌بندی محصول مشخص نیست");
    await ProductService.create({
      mode: "xray_auto",
      categoryId,
      title: String(flow.data.title),
      price: Number(flow.data.price),
      duration: Number(flow.data.durationDays ?? flow.data.duration),
      durationDays: Number(flow.data.durationDays ?? flow.data.duration),
      trafficGB: Number(flow.data.trafficGB),
      stockLimit: Number(flow.data.stockLimit),
      inboundIds: flow.data.inboundIds as unknown as number[],
      inboundSnapshot: String(flow.data.inboundSnapshot),
      limitIp: Number(flow.data.limitIp ?? 0),
      xrayGroupName: flow.data.xrayGroupName ? String(flow.data.xrayGroupName) : null,
      actorId: String(ctx.from?.id ?? "admin"),
    });
    ctx.session.flow = undefined;
  }

  bot.action(/^xpg:l:(f|pc|pe)(?::([^:]+))?$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return;
    if (isExpiredPickerToken(ctx, ctx.match[1], ctx.match[2])) return replyExpiredPickerToken(ctx);
    await showXrayGroupPicker(ctx, pickerTargetFromAlias[ctx.match[1] as XrayPickerTargetAlias], resolvePickerProductId(ctx, ctx.match[2]));
  });

  bot.action(/^admin:xray_picker:group:(free_test|product_create|product_edit)(?::([^:]+))?$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return;
    await showXrayGroupPicker(ctx, ctx.match[1] as any, ctx.match[2]);
  });

  async function saveXrayGroupSelection(
    ctx: AppContext,
    target: "free_test" | "product_create" | "product_edit",
    selected: string | null,
    productId?: string,
  ) {
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return;
    if (target === "free_test") {
      await FreeAccountService.updateXrayConfig({ groupName: selected }, String(ctx.from.id));
      await ctx.reply("✅ گروه اکانت تست ذخیره شد.");
      return renderPanel(ctx, { id: "admin.freeAccounts" }, "replace");
    }
    if (target === "product_edit" && productId) {
      await AdminService.updateProduct(productId, { xrayGroupName: selected }, String(ctx.from.id));
      await ctx.reply("✅ گروه محصول برای خریدهای بعدی ذخیره شد.");
      return renderPanel(ctx, { id: "admin.product", params: { productId } }, "replace");
    }
    if (!ctx.session.flow || ctx.session.flow.name !== "product_create") return void (await ctx.reply("⚠️ فرم ساخت محصول فعال نیست."));
    ctx.session.flow.data.xrayGroupName = selected ?? undefined;
    ctx.session.flow.step = "inbounds";
    await showXrayInboundPicker(ctx, "product_create");
  }

  bot.action(/^xpg:s:([^:]+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const payload = resolveCallbackToken(ctx, "xrayGroupSelect", ctx.match[1]);
    if (!payload) return void (await ctx.reply("⚠️ این دکمه منقضی شده است. لطفاً لیست گروه‌ها را بروزرسانی کنید."));
    return saveXrayGroupSelection(ctx, payload.target, payload.selected, payload.productId);
  });

  bot.action(/^xpg:s:(f|pc|pe):(n|\d+)(?::([^:]+))?$/, async (ctx) => {
    await ctx.answerCbQuery();
    const target = pickerTargetFromAlias[ctx.match[1] as XrayPickerTargetAlias];
    const groups = ctx.session.xrayPicker?.groups
      ? (JSON.parse(ctx.session.xrayPicker.groups) as Awaited<ReturnType<typeof XrayClientService.listGroups>>)
      : [];
    const selected = ctx.match[2] === "n" ? null : groups[Number(ctx.match[2])]?.name;
    if (ctx.match[2] !== "n" && !selected) return void (await ctx.reply("⚠️ گروه انتخابی پیدا نشد. لیست را بروزرسانی کنید."));
    return saveXrayGroupSelection(ctx, target, selected, resolvePickerProductId(ctx, ctx.match[3]));
  });

  bot.action(/^admin:xray_picker:group:select:(free_test|product_create|product_edit):([^:]+)(?::([^:]+))?$/, async (ctx) => {
    await ctx.answerCbQuery();
    const selected = ctx.match[2] === "__none__" ? null : decodeURIComponent(ctx.match[2]);
    return saveXrayGroupSelection(ctx, ctx.match[1] as any, selected, ctx.match[3]);
  });

  bot.action(/^xpi:l:(f|pc|pe)(?::([^:]+))?$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return;
    if (isExpiredPickerToken(ctx, ctx.match[1], ctx.match[2])) return replyExpiredPickerToken(ctx);
    await showXrayInboundPicker(ctx, pickerTargetFromAlias[ctx.match[1] as XrayPickerTargetAlias], resolvePickerProductId(ctx, ctx.match[2]));
  });

  bot.action(/^admin:xray_picker:inbounds:(free_test|product_create|product_edit)(?::([^:]+))?$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return;
    await showXrayInboundPicker(ctx, ctx.match[1] as any, ctx.match[2]);
  });

  bot.action(/^xpi:t:(f|pc|pe):(\d+)(?::([^:]+))?$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return;
    const state = ctx.session.xrayPicker;
    const id = Number(ctx.match[2]);
    const target = pickerTargetFromAlias[ctx.match[1] as XrayPickerTargetAlias];
    if (isExpiredPickerToken(ctx, ctx.match[1], ctx.match[3])) return replyExpiredPickerToken(ctx);
    if (!state?.inboundOptions) return showXrayInboundPicker(ctx, target, resolvePickerProductId(ctx, ctx.match[3]));
    const inbounds = JSON.parse(state.inboundOptions) as Awaited<ReturnType<typeof XrayClientService.listInbounds>>;
    if (!inbounds.some((inbound) => inbound.id === id)) return void (await ctx.reply("⚠️ اینباند انتخابی در لیست زنده وجود ندارد."));
    state.selectedIds = (state.selectedIds ?? []).includes(id)
      ? (state.selectedIds ?? []).filter((item) => item !== id)
      : [...(state.selectedIds ?? []), id];
    await ctx
      .editMessageReplyMarkup(xrayInboundPickerKeyboard(ctx, target, inbounds, state.selectedIds, resolvePickerProductId(ctx, ctx.match[3])))
      .catch(() => undefined);
  });

  bot.action(/^admin:xray_picker:inbound:toggle:(free_test|product_create|product_edit):(\d+)(?::([^:]+))?$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return;
    const state = ctx.session.xrayPicker;
    const id = Number(ctx.match[2]);
    if (!state?.inboundOptions) return showXrayInboundPicker(ctx, ctx.match[1] as any, ctx.match[3]);
    const inbounds = JSON.parse(state.inboundOptions) as Awaited<ReturnType<typeof XrayClientService.listInbounds>>;
    if (!inbounds.some((inbound) => inbound.id === id)) return void (await ctx.reply("⚠️ اینباند انتخابی در لیست زنده وجود ندارد."));
    state.selectedIds = (state.selectedIds ?? []).includes(id)
      ? (state.selectedIds ?? []).filter((item) => item !== id)
      : [...(state.selectedIds ?? []), id];
    await ctx
      .editMessageReplyMarkup(xrayInboundPickerKeyboard(ctx, ctx.match[1] as any, inbounds, state.selectedIds, ctx.match[3]))
      .catch(() => undefined);
  });

  bot.action(/^xpi:s:(f|pc|pe)(?::([^:]+))?$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return;
    const target = pickerTargetFromAlias[ctx.match[1] as XrayPickerTargetAlias];
    if (isExpiredPickerToken(ctx, ctx.match[1], ctx.match[2])) return replyExpiredPickerToken(ctx);
    const productId = resolvePickerProductId(ctx, ctx.match[2]);
    const state = ctx.session.xrayPicker;
    if (!state?.selectedIds?.length) return void (await ctx.reply("⚠️ حداقل یک اینباند لازم است"));
    const live = await XrayClientService.listInbounds();
    const liveIds = new Set(live.map((i) => i.id));
    const selectedIds = [...new Set(state.selectedIds)].filter((id) => liveIds.has(id));
    if (!selectedIds.length || selectedIds.length !== state.selectedIds.length)
      return void (await ctx.reply("⚠️ یکی از اینباندهای انتخاب‌شده دیگر در پنل وجود ندارد. لیست را بروزرسانی کنید."));
    const inboundSnapshot = xrayInboundSnapshot(live, selectedIds);
    if (target === "free_test") {
      await FreeAccountService.updateXrayConfig({ inboundIds: selectedIds, inboundSnapshot }, String(ctx.from.id));
      ctx.session.xrayPicker = undefined;
      await ctx.reply("✅ اینباندهای اکانت تست ذخیره شدند.");
      return renderPanel(ctx, { id: "admin.freeAccounts" }, "replace");
    }
    if (target === "product_edit" && productId) {
      await AdminService.updateProduct(productId, { inboundIds: selectedIds, inboundSnapshot }, String(ctx.from.id));
      ctx.session.xrayPicker = undefined;
      await ctx.reply("✅ اینباندهای محصول برای خریدهای بعدی ذخیره شد.");
      return renderPanel(ctx, { id: "admin.product", params: { productId } }, "replace");
    }
    if (!ctx.session.flow || ctx.session.flow.name !== "product_create") return void (await ctx.reply("⚠️ فرم ساخت محصول فعال نیست."));
    ctx.session.flow.data.inboundIds = selectedIds as any;
    ctx.session.flow.data.inboundSnapshot = inboundSnapshot;
    await completeProductCreateFromPicker(ctx);
    ctx.session.xrayPicker = undefined;
    await ctx.reply("✅ محصول Xray با موجودی خودکار ثبت شد.");
    await renderPanel(ctx, { id: "admin.products" }, "replace");
  });

  bot.action("admin:free_test:inbounds", async (ctx) => {
    await ctx.answerCbQuery();
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return;
    try {
      await showXrayInboundPicker(ctx, "free_test");
    } catch (error) {
      await ctx.reply(`⚠️ ${error instanceof Error ? error.message : "دریافت اینباندها ناموفق بود"}`);
    }
  });

  bot.action(/^admin:free_test:inbound:toggle:(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return;
    const state = ctx.session.freeTestInboundSelection;
    if (!state) return showFreeTestInboundSelector(ctx);
    const id = Number(ctx.match[1]);
    const inbounds = JSON.parse(state.inboundOptions) as Awaited<ReturnType<typeof XrayClientService.listInbounds>>;
    if (!inbounds.some((inbound) => inbound.id === id)) return void (await ctx.reply("⚠️ اینباند انتخابی در لیست زنده وجود ندارد."));
    state.selectedIds = state.selectedIds.includes(id) ? state.selectedIds.filter((item) => item !== id) : [...state.selectedIds, id];
    await ctx.editMessageReplyMarkup(freeTestInboundKeyboard(inbounds, state.selectedIds)).catch(() => undefined);
  });

  bot.action("admin:free_test:inbounds:save", async (ctx) => {
    await ctx.answerCbQuery();
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return;
    const state = ctx.session.freeTestInboundSelection;
    if (!state?.selectedIds.length) return void (await ctx.reply("⚠️ حداقل یک اینباند لازم است"));
    try {
      await FreeAccountService.updateXrayConfig({ inboundIds: state.selectedIds }, String(ctx.from.id));
      ctx.session.freeTestInboundSelection = undefined;
      await ctx.reply("✅ اینباندهای اکانت تست ذخیره شدند.");
      await renderPanel(ctx, { id: "admin.freeAccounts" }, "replace");
    } catch (error) {
      await ctx.reply(`⚠️ ${error instanceof Error ? error.message : "ذخیره اینباندها ناموفق بود"}`);
    }
  });

  bot.action(/^admin:free_test:enabled:(0|1)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return;
    try {
      await FreeAccountService.updateXrayConfig({ enabled: ctx.match[1] === "1" }, String(ctx.from.id));
    } catch (error) {
      await ctx.reply(`⚠️ ${error instanceof Error ? error.message : "خطا"}`);
    }
    await renderPanel(ctx, { id: "admin.freeAccounts" }, "replace");
  });


  bot.action(/^admin:xray:refresh:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return;
    try {
      const detail = await AdminService.refreshXrayClient(ctx.match[1]);
      await ctx.reply(`✅ اطلاعات پنل دریافت شد\n${detail.client.clientEmail}`);
    } catch (error) {
      await ctx.reply(`⚠️ دریافت اطلاعات پنل ناموفق بود\n${error instanceof Error ? error.message : "خطای نامشخص"}`);
    }
  });


  bot.action(/^admin:free_account:view:([^:]+)$/, async (ctx) => {
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return ctx.answerCbQuery("دسترسی غیرمجاز");
    await ctx.answerCbQuery();
    const account = await FreeAccountService.getAccount(ctx.match[1]);
    if (!account) {
      await ctx.reply("⚠️ اکانت تست پیدا نشد.");
      return;
    }
    const assignment = account.assignment;
    const expiresAt = assignment
      ? (assignment.expiresAt ?? freeAccountExpiresAt(assignment.assignedAt ?? assignment.createdAt, account.durationDays))
      : undefined;
    await ctx.reply(
      `🆓 جزئیات اکانت تست

━━━━━━━━━━━━━━━━

👤 نام کاربری:
${account.username}

🔗 لینک اشتراک:
${account.subscriptionLink}

⚙️ لینک کانفیگ:
${account.configLink}

⏳ مدت اعتبار: ${account.durationDays.toLocaleString("fa-IR")} روز
📌 وضعیت: ${FREE_ACCOUNT_STATUS_LABELS[account.status]}
👥 کاربر دریافت‌کننده: ${assignment?.user.telegramId ?? "—"}
📅 تاریخ تخصیص: ${formatFreeAccountDate(assignment?.assignedAt ?? assignment?.createdAt)}
📅 تاریخ انقضا: ${formatFreeAccountDate(expiresAt)}

━━━━━━━━━━━━━━━━`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "✏️ ویرایش", callback_data: actionFor("flow:start", "free_account_edit", account.id) }],
            [
              { text: "✅ آماده", callback_data: actionFor("admin:free_account:status", account.id, "available") },
              { text: "🚫 منقضی/غیرفعال", callback_data: actionFor("admin:free_account:status", account.id, "expired") },
            ],
            [{ text: "🗑 حذف", callback_data: actionFor("admin:free_account:delete", account.id) }],
            [{ text: "🔙 مدیریت اکانت تست", callback_data: callbackFor("admin.freeAccounts") }],
          ],
        },
      },
    );
  });

  bot.action(/^admin:free_account:status:([^:]+):(available|assigned|expired)$/, async (ctx) => {
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return ctx.answerCbQuery("دسترسی غیرمجاز");
    await ctx.answerCbQuery("وضعیت به‌روزرسانی شد");
    try {
      await FreeAccountService.updateAccount(ctx.match[1], { status: ctx.match[2] as "available" | "assigned" | "expired" }, String(ctx.from.id));
    } catch (error) {
      await ctx.reply(error instanceof Error ? `⚠️ ${error.message}` : "⚠️ ویرایش وضعیت ناموفق بود.");
      return;
    }
    await renderPanel(ctx, { id: "admin.freeAccounts" }, "replace");
  });

  bot.action(/^admin:free_account:delete:([^:]+)$/, async (ctx) => {
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return ctx.answerCbQuery("دسترسی غیرمجاز");
    await ctx.answerCbQuery("حذف شد");
    await FreeAccountService.deleteAccount(ctx.match[1], String(ctx.from.id));
    await renderPanel(ctx, { id: "admin.freeAccounts" }, "replace");
  });

  bot.action(/^admin:account:status:([^:]+):(available|reserved|sold|disabled|expired)$/, async (ctx) => {
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return ctx.answerCbQuery("دسترسی غیرمجاز");
    await ctx.answerCbQuery();
    await AdminService.setAccountStatus(
      ctx.match[1],
      ctx.match[2] as "available" | "reserved" | "sold" | "disabled" | "expired",
      String(ctx.from.id),
    );
    await renderPanel(ctx, { id: "admin.account", params: { accountId: ctx.match[1] } }, "replace");
  });

  bot.action(/^admin:account:move_to:([^:]+):([^:]+)$/, async (ctx) => {
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return ctx.answerCbQuery("دسترسی غیرمجاز");
    await ctx.answerCbQuery();
    const account = await AdminService.moveAccount(ctx.match[1], ctx.match[2], String(ctx.from.id));
    await renderPanel(ctx, { id: "admin.account", params: { accountId: account.id } }, "replace");
  });

  bot.action(/^admin:account:delete:confirm:([^:]+)$/, async (ctx) => {
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return ctx.answerCbQuery("دسترسی غیرمجاز");
    await ctx.answerCbQuery();
    await ctx.reply(
      adminDangerConfirmMessage({ action: "حذف اکانت از موجودی", item: ctx.match[1] }),
      adminDangerConfirmKeyboard(actionFor("admin:account:delete:force", ctx.match[1]), callbackFor("admin.account", { accountId: ctx.match[1] })),
    );
  });

  bot.action(/^admin:account:delete:force:([^:]+)$/, async (ctx) => {
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return ctx.answerCbQuery("دسترسی غیرمجاز");
    await ctx.answerCbQuery();
    await AdminService.deleteAccount(ctx.match[1], String(ctx.from.id));
    await renderPanel(ctx, { id: "admin.accounts" }, "replace");
  });
}
