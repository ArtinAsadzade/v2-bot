import { registerView, callbackFor, actionFor, type UiKeyboard } from "../navigation/panel-ui";
import { createCallbackToken, tokenAction } from "../navigation/callback-tokens";
import { card, joinSections } from "../ui/layout";
import { prisma } from "../../services/prisma";
import { UserService } from "../../modules/user/user.service";
import {
  PredictionService,
  canSubmitPrediction,
  getPredictionDisplayStatus,
  predictionDisplayStatusFa,
} from "../../modules/prediction/prediction.service";
import { PredictionDateService } from "../../modules/prediction/prediction-date.service";

const db = prisma as any;
const fmt = (d: Date) => PredictionDateService.formatPredictionDate(d);
const statusFa: Record<string, string> = {
  draft: "پیش‌نویس",
  open: predictionDisplayStatusFa.open,
  closed: predictionDisplayStatusFa.waiting_result,
  resulted: predictionDisplayStatusFa.resulted,
  announced: predictionDisplayStatusFa.announced,
  archived: predictionDisplayStatusFa.archived,
};

export function registerPredictionViews() {
  const navigationRows: UiKeyboard = [
    [{ text: "🟢 پیش‌بینی‌های باز", action: callbackFor("prediction"), tone: "neutral" }],
    [{ text: "📂 بسته‌شده‌ها (در انتظار نتیجه)", action: callbackFor("prediction.waiting"), tone: "neutral" }],
    [{ text: "🏁 نتایج نهایی", action: callbackFor("prediction.results"), tone: "neutral" }],
    [{ text: "🎯 پیش‌بینی‌های من", action: callbackFor("prediction.history"), tone: "neutral" }],
    [{ text: "🎁 جوایز", action: callbackFor("account.rewards"), tone: "neutral" }],
  ];
  const contestRows = (contests: any[], tone: "primary" | "success" = "primary"): UiKeyboard =>
    contests.map((c: any) => [{ text: c.title, action: callbackFor("prediction.detail", { contestId: c.id }), tone }]);

  registerView("prediction", async () => {
    const now = new Date();
    const contests = await PredictionService.getOpenPredictions(
      {
        orderBy: { closesAt: "asc" },
        take: 20,
        include: { _count: { select: { entries: true } } },
      },
      now,
    );
    return {
      replyKeyboard: "home",
      text: joinSections([
        card(
          "🔮 پیش‌بینی مسابقات",
          contests.length
            ? contests.map((c: any) => `• ${c.title} · تا ${fmt(c.closesAt)} · باقی‌مانده: ${PredictionDateService.countdown(c.closesAt, now)}`)
            : ["در حال حاضر پیش‌بینی بازی فعالی وجود ندارد."],
        ),
        card("ناوبری", ["برای مرور وضعیت‌های دیگر از دکمه‌های زیر استفاده کنید."]),
      ]),
      keyboard: [
        ...contestRows(contests, "primary"),
        ...navigationRows,
        [{ text: "🏠 خانه", action: callbackFor("home"), tone: "neutral" as const }],
      ],
    };
  });

  registerView("prediction.waiting", async () => {
    const now = new Date();
    const contests = await PredictionService.getWaitingResultPredictions(
      {
        orderBy: { closesAt: "desc" },
        take: 20,
        include: { _count: { select: { entries: true } } },
      },
      now,
    );
    return {
      text: card(
        "📂 در انتظار نتیجه",
        contests.length
          ? contests.map(
              (c: any) =>
                `• ${c.title} · ⏳ در انتظار اعلام نتیجه · جایزه: ${PredictionService.rewardLabel(c)} · شرکت‌کننده: ${(c._count?.entries ?? 0).toLocaleString("fa-IR")}`,
            )
          : ["پیش‌بینی در انتظار نتیجه وجود ندارد."],
      ),
      keyboard: [...contestRows(contests)],
    };
  });



  registerView("prediction.results", async () => {
    const contests = await PredictionService.getAnnouncedPredictions({
      orderBy: { updatedAt: "desc" },
      take: 20,
      include: { resultOption: true, _count: { select: { entries: true } } },
    });
    return {
      text: card(
        "🏁 نتایج نهایی",
        contests.length
          ? contests.map((c: any) => `• ${c.title} · ${predictionDisplayStatusFa[getPredictionDisplayStatus(c)]} · نتیجه: ${c.resultOption?.title ?? "ثبت‌شده"}`)
          : ["نتیجه‌ای برای نمایش وجود ندارد."],
      ),
      keyboard: [...contestRows(contests)],
    };
  });

  registerView("prediction.history", async (ctx) => {
    const user = ctx.from ? await UserService.findOrCreateUser(ctx) : undefined;

    const contests = user
      ? await PredictionService.getUserPredictions({
          where: {
            entries: {
              some: {
                userId: user.id,
              },
            },
          },
          orderBy: {
            updatedAt: "desc",
          },
          take: 20,
          include: {
            entries: {
              where: {
                userId: user.id,
              },
              include: {
                option: true,
              },
            },
          },
        })
      : [];

    return {
      text: card(
        "🎯 پیش‌بینی‌های من",
        contests.length
          ? contests.map(
              (c: any) =>
                `• ${c.title} · ${predictionDisplayStatusFa[getPredictionDisplayStatus(c)]} · انتخاب شما: ${
                  c.entries?.[0]?.option?.title ?? "ثبت‌شده"
                }`,
            )
          : ["هنوز در پیش‌بینی‌ای شرکت نکرده‌اید."],
      ),
      keyboard: [...contestRows(contests)],
    };
  });

  registerView("prediction.detail", async (ctx, params) => {
    const user = ctx.from ? await UserService.findOrCreateUser(ctx) : undefined;
    const contest = await db.predictionContest.findUnique({
      where: { id: params.contestId },
      include: {
        options: { orderBy: { order: "asc" } },
        _count: { select: { entries: true } },
      },
    });
    if (!contest || contest.status === "deleted" || contest.status === "archived")
      return {
        text: "❌ پیش‌بینی پیدا نشد.",
        keyboard: [
          [
            {
              text: "🔙 بازگشت",
              action: callbackFor("prediction"),
              tone: "neutral",
            },
          ],
        ],
      };
    const [entry, rewardProduct] = await Promise.all([
      user
        ? db.predictionEntry.findFirst({ where: { contestId: contest.id, userId: user.id }, include: { option: true } })
        : Promise.resolve(undefined),
      PredictionService.getRewardProduct(contest.rewardProductId),
    ]);
    const contestWithReward = PredictionService.attachRewardProduct(contest, rewardProduct);
    const now = new Date();
    const displayStatus = getPredictionDisplayStatus(contest, now);
    const open = canSubmitPrediction(contest, now);
    const archived = displayStatus === "archived";
    const optionRows: UiKeyboard =
      open && (!entry || contest.allowUserEdit)
        ? contest.options.map((o: any) => [
            {
              text: o.title,
              action: tokenAction(
                "pr:p",
                createCallbackToken(ctx, "predictionPick", {
                  contestId: contest.id,
                  optionId: o.id,
                }),
              ),
              tone: "success",
            },
          ])
        : [];
    return {
      text: joinSections([
        card(`🔮 ${contest.title}`, [
          contest.question,
          contest.description ?? "",
          ...PredictionService.rewardDetails(contestWithReward, "user"),
          `🏆 تعداد برنده‌ها: ${contest.winnerCount.toLocaleString("fa-IR")}`,
          `⏳ مهلت: ${fmt(contest.closesAt)}`,
          `👥 شرکت‌کنندگان: ${contest._count.entries.toLocaleString("fa-IR")} نفر`,
          `وضعیت: ${predictionDisplayStatusFa[displayStatus]}`,
          ...(displayStatus === "waiting_result" && entry ? ["⏳ زمان ثبت پیش‌بینی تمام شده؛ منتظر اعلام نتیجه باشید."] : []),
          entry
            ? `✅ انتخاب شما: ${entry.option?.title ?? "ثبت‌شده"}`
            : archived
              ? "آرشیوشده"
              : open
                ? "برای شرکت، یک گزینه را انتخاب کنید."
                : displayStatus === "waiting_result"
                  ? "⏳ زمان ثبت پیش‌بینی به پایان رسیده است."
                  : predictionDisplayStatusFa[displayStatus],
        ]),
      ]),
      keyboard: [...optionRows],
    };
  });

  registerView("admin.predictions", async () => {
    const [total, open, closed, resulted, announced, archived, entries] = await Promise.all([
      db.predictionContest.count({ where: { status: { not: "deleted" } } }),
      db.predictionContest.count({ where: { status: "open" } }),
      db.predictionContest.count({ where: { status: "closed" } }),
      db.predictionContest.count({ where: { status: "resulted" } }),
      db.predictionContest.count({ where: { status: "announced" } }),
      db.predictionContest.count({ where: { status: "archived" } }),
      db.predictionEntry.count(),
    ]);
    return {
      replyKeyboard: "admin",
      text: joinSections([
        card("🔮 مدیریت پیش‌بینی‌ها", [
          `تعداد کل پیش‌بینی‌ها: ${total.toLocaleString("fa-IR")}`,
          `باز: ${open.toLocaleString("fa-IR")}`,
          `بسته‌شده: ${closed.toLocaleString("fa-IR")}`,
          `نتیجه‌دار: ${resulted.toLocaleString("fa-IR")}`,
          `اعلام‌شده: ${announced.toLocaleString("fa-IR")}`,
          `آرشیوشده: ${archived.toLocaleString("fa-IR")}`,
          `تعداد شرکت‌کننده‌ها: ${entries.toLocaleString("fa-IR")}`,
        ]),
      ]),
      keyboard: [
        [
          {
            text: "➕ ساخت پیش‌بینی جدید",
            action: actionFor("flow:start", "prediction_create"),
            tone: "success",
          },
          {
            text: "📋 لیست پیش‌بینی‌ها",
            action: callbackFor("admin.predictionList"),
            tone: "primary",
          },
        ],
        [
          {
            text: "🟢 پیش‌بینی‌های باز",
            action: callbackFor("admin.predictionList", { status: "open" }),
            tone: "primary",
          },
          {
            text: "🕒 بسته‌شده‌ها",
            action: callbackFor("admin.predictionList", { status: "closed" }),
            tone: "primary",
          },
        ],
        [
          {
            text: "🏆 نتیجه‌دار",
            action: callbackFor("admin.predictionList", { status: "resulted" }),
            tone: "success",
          },
          {
            text: "📣 اعلام‌شده",
            action: callbackFor("admin.predictionList", {
              status: "announced",
            }),
            tone: "primary",
          },
        ],
        [
          {
            text: "🗄 آرشیوشده",
            action: callbackFor("admin.predictionList", { status: "archived" }),
            tone: "primary",
          },
          {
            text: "📊 همه",
            action: callbackFor("admin.predictionList"),
            tone: "primary",
          },
        ],
      ],
    };
  });

  registerView("admin.predictionList", async (_ctx, params) => {
    const contests = await PredictionService.getAdminPredictions({
      where: params.status ? { status: params.status } : {},
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    return {
      text: card(
        "📋 لیست پیش‌بینی‌ها",
        contests.length
          ? contests.map((c: any) => `• ${c.title} · ${predictionDisplayStatusFa[getPredictionDisplayStatus(c)]}`)
          : ["موردی وجود ندارد."],
      ),
      keyboard: [
        ...contests.map((c: any) => [
          {
            text: c.title,
            action: callbackFor("admin.predictionDetail", { contestId: c.id }),
            tone: "primary" as const,
          },
        ]),
        [
          {
            text: "🔙 مدیریت پیش‌بینی‌ها",
            action: callbackFor("admin.predictions"),
            tone: "neutral",
          },
        ],
      ],
    };
  });

  registerView("admin.predictionDetail", async (_ctx, params) => {
    const c = await db.predictionContest.findUnique({
      where: { id: params.contestId },
      include: {
        options: { orderBy: { order: "asc" } },
        entries: true,
        winners: true,
        _count: { select: { entries: true } },
      },
    });
    if (!c || c.status === "deleted")
      return {
        text: "❌ پیش‌بینی پیدا نشد.",
        keyboard: [
          [
            {
              text: "🔙 بازگشت",
              action: callbackFor("admin.predictions"),
              tone: "neutral",
            },
          ],
        ],
      };
    const rewardProduct = await PredictionService.getRewardProduct(c.rewardProductId);
    const contestWithReward = PredictionService.attachRewardProduct(c, rewardProduct);
    const correct = c.entries.filter((e: any) => ["correct", "winner", "rewarded"].includes(e.status)).length;
    return {
      text: joinSections([
        card(`🔮 ${c.title}`, [
          `سؤال: ${c.question}`,
          `وضعیت: ${predictionDisplayStatusFa[getPredictionDisplayStatus(c)]}`,
          `زمان بسته شدن: ${fmt(c.closesAt)}`,
          `جوایز دریافت‌شده: ${c.winners.filter((w: any) => w.status === "claimed").length.toLocaleString("fa-IR")}`,
          `گزینه‌ها: ${c.options.map((o: any) => o.title).join("، ")}`,
          `شرکت‌کنندگان: ${c._count.entries.toLocaleString("fa-IR")}`,
          `درست: ${correct.toLocaleString("fa-IR")}`,
          `برنده‌ها: ${c.winners.length.toLocaleString("fa-IR")} از ${c.winnerCount.toLocaleString("fa-IR")}`,
          ...PredictionService.rewardDetails(contestWithReward, "admin"),
          c.resultOptionId
            ? "نتیجه ثبت شده است."
            : getPredictionDisplayStatus(c) === "waiting_result"
              ? "⏳ مهلت ثبت پیش‌بینی تمام شده است. نتیجه هنوز ثبت نشده."
              : "نتیجه هنوز ثبت نشده است.",
        ]),
      ]),
      keyboard: [
        [
          {
            text: "✏️ ویرایش عنوان",
            action: actionFor("flow:start", "prediction_edit", c.id, "title"),
            tone: "primary",
          },
          {
            text: "📝 ویرایش توضیحات",
            action: actionFor("flow:start", "prediction_edit", c.id, "description"),
            tone: "primary",
          },
        ],
        [
          {
            text: "➕ افزودن گزینه",
            action: actionFor("flow:start", "prediction_option", c.id),
            tone: "success",
          },
          {
            text: "✏️ مدیریت گزینه‌ها",
            action: callbackFor("admin.predictionStats", { contestId: c.id }),
            tone: "primary",
          },
        ],
        [
          {
            text: "🕒 تغییر زمان بسته شدن",
            action: actionFor("dtp", "start", "pe", c.id),
            tone: "primary",
          },
          {
            text: "🔒 بستن پیش‌بینی",
            action: actionFor("ap:close", c.id),
            tone: "danger",
          },
        ],
        [
          {
            text: "🎁 تغییر جایزه",
            action: actionFor("flow:start", "prediction_edit", c.id, "reward"),
            tone: "primary",
          },
          {
            text: "🔢 تغییر تعداد برنده‌ها",
            action: actionFor("flow:start", "prediction_edit", c.id, "winnerCount"),
            tone: "primary",
          },
        ],
        [
          {
            text: "🏁 ثبت نتیجه",
            action: callbackFor("admin.predictionResult", { contestId: c.id }),
            tone: "success",
          },
          {
            text: "🏆 انتخاب برنده‌ها",
            action: actionFor("ap:win", c.id),
            tone: "success",
          },
          {
            text: "📣 اعلام نتایج",
            action: actionFor("ap:ann", c.id),
            tone: "success",
          },
        ],
        [
          {
            text: "📊 آمار شرکت‌کنندگان",
            action: callbackFor("admin.predictionStats", { contestId: c.id }),
            tone: "primary",
          },
          {
            text: "👥 لیست شرکت‌کنندگان",
            action: callbackFor("admin.predictionParticipants", {
              contestId: c.id,
            }),
            tone: "primary",
          },
        ],
        [
          {
            text: "🗑 حذف/آرشیو",
            action: actionFor("ap:del", c.id),
            tone: "danger",
          },
        ],
      ],
    };
  });

  registerView("admin.predictionResult", async (_ctx, params) => {
    const c = await db.predictionContest.findUnique({
      where: { id: params.contestId },
      include: { options: { orderBy: { order: "asc" } } },
    });
    return {
      text: card("🏁 ثبت نتیجه", ["نتیجه درست را انتخاب کنید."]),
      keyboard: [
        ...(c?.options ?? []).map((o: any) => [
          {
            text: o.title,
            action: actionFor("ap:res", c.id, o.id),
            tone: "success" as const,
          },
        ]),
        [
          {
            text: "🔙 بازگشت",
            action: callbackFor("admin.predictionDetail", {
              contestId: params.contestId,
            }),
            tone: "neutral",
          },
        ],
      ],
    };
  });

  registerView("admin.predictionStats", async (_ctx, params) => {
    const c = await db.predictionContest.findUnique({
      where: { id: params.contestId },
      include: { options: true, entries: true, winners: true },
    });
    const lines = (c?.options ?? []).map(
      (o: any) => `• ${o.title}: ${c.entries.filter((e: any) => e.optionId === o.id).length.toLocaleString("fa-IR")}`,
    );
    return {
      text: joinSections([
        card("📊 آمار پیش‌بینی", [
          ...lines,
          `درست: ${c?.entries.filter((e: any) => ["correct", "winner", "rewarded"].includes(e.status)).length.toLocaleString("fa-IR")}`,
          `اشتباه: ${c?.entries.filter((e: any) => e.status === "wrong").length.toLocaleString("fa-IR")}`,
          `جوایز دریافت‌شده: ${c?.winners.filter((w: any) => w.status === "claimed").length.toLocaleString("fa-IR")}`,
          `خطاهای اطلاع‌رسانی: ${c?.winners.filter((w: any) => w.status === "failed").length.toLocaleString("fa-IR")}`,
        ]),
      ]),
      keyboard: [
        [
          {
            text: "🔙 جزئیات",
            action: callbackFor("admin.predictionDetail", {
              contestId: params.contestId,
            }),
            tone: "neutral",
          },
        ],
      ],
    };
  });

  registerView("admin.predictionParticipants", async (_ctx, params) => {
    const entries = await db.predictionEntry.findMany({
      where: { contestId: params.contestId },
      include: { option: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return {
      text: card(
        "👥 لیست شرکت‌کنندگان",
        entries.length
          ? entries.map((e: any) => `• ${e.telegramId} · ${e.option?.title ?? "گزینه"} · ${statusFa[e.status] ?? e.status}`)
          : ["هنوز شرکت‌کننده‌ای وجود ندارد."],
      ),
      keyboard: [],
    };
  });

  registerView("admin.predictionDeleteConfirm", async (_ctx, params) => {
    const c = await db.predictionContest.findUnique({
      where: { id: params.contestId },
      include: { entries: true, winners: true },
    });
    if (!c)
      return {
        text: "❌ پیش‌بینی پیدا نشد.",
        keyboard: [
          [
            {
              text: "🔙 بازگشت",
              action: callbackFor("admin.predictions"),
              tone: "neutral",
            },
          ],
        ],
      };
    const mode = await PredictionService.getPredictionDeleteMode(c.id);
    if (mode === "hard_delete_allowed") {
      return {
        text: joinSections([card("🗑 حذف پیش‌بینی", ["این پیش‌بینی هنوز شرکت‌کننده‌ای ندارد و می‌تواند به‌صورت کامل حذف شود."])]),
        keyboard: [
          [
            {
              text: "🗑 حذف کامل",
              action: actionFor("ap:delc", c.id),
              tone: "danger",
            },
          ],
          [
            {
              text: "🔙 بازگشت",
              action: callbackFor("admin.predictionDetail", {
                contestId: c.id,
              }),
              tone: "neutral",
            },
          ],
        ],
      };
    }
    return {
      text: joinSections([
        card("🗄 آرشیو پیش‌بینی", [
          "این پیش‌بینی دارای شرکت‌کننده است؛ برای حفظ سوابق و جلوگیری از مشکل در آمار و جوایز، حذف کامل مجاز نیست.",
          "می‌توانید آن را آرشیو کنید تا دیگر برای کاربران نمایش داده نشود.",
        ]),
      ]),
      keyboard: [
        [
          {
            text: "🗄 آرشیو پیش‌بینی",
            action: actionFor("ap:arcc", c.id),
            tone: "danger",
          },
        ],
        [
          {
            text: "📊 مشاهده آمار",
            action: callbackFor("admin.predictionStats", { contestId: c.id }),
            tone: "primary",
          },
        ],
        [
          {
            text: "🔙 بازگشت",
            action: callbackFor("admin.predictionDetail", { contestId: c.id }),
            tone: "neutral",
          },
        ],
      ],
    };
  });
}
