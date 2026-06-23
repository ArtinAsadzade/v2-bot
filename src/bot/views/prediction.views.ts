import { registerView, callbackFor, actionFor, type UiKeyboard } from "../navigation/panel-ui";
import { createCallbackToken, tokenAction } from "../navigation/callback-tokens";
import { card, joinSections } from "../ui/layout";
import { prisma } from "../../services/prisma";
import { UserService } from "../../modules/user/user.service";
import { PredictionService } from "../../modules/prediction/prediction.service";

const db = prisma as any;
const fmt = (d: Date) => new Date(d).toLocaleString("fa-IR", { timeZone: "Europe/Istanbul" });
const statusFa: Record<string, string> = {
  draft: "پیش‌نویس",
  open: "باز",
  closed: "بسته‌شده",
  resulted: "نتیجه‌دار",
  announced: "اعلام‌شده",
  archived: "آرشیوشده",
};

export function registerPredictionViews() {
  registerView("prediction", async (ctx) => {
    const user = ctx.from ? await UserService.findOrCreateUser(ctx) : undefined;
    const contests = await db.predictionContest.findMany({
      where: { status: "open" },
      orderBy: [{ status: "asc" }, { closesAt: "desc" }],
      take: 10,
      include: { entries: user ? { where: { userId: user.id } } : false },
    });
    const rows: UiKeyboard = contests.map((c: any) => [
      {
        text: `${c.status === "open" ? "🟢" : "⚪️"} ${c.title}`,
        action: callbackFor("prediction.detail", { contestId: c.id }),
        tone: "primary",
      },
    ]);
    return {
      replyKeyboard: "home",
      text: joinSections([
        card(
          "🔮 پیش‌بینی",
          contests.length
            ? contests.map((c: any) => `• ${c.title} · ${statusFa[c.status]} · تا ${fmt(c.closesAt)}`)
            : ["فعلاً پیش‌بینی فعالی وجود ندارد."],
        ),
      ]),
      keyboard: [
        [
          {
            text: "🟢 پیش‌بینی‌های فعال",
            action: callbackFor("prediction"),
            tone: "primary",
          },
          {
            text: "📜 نتایج گذشته",
            action: callbackFor("prediction.results"),
            tone: "primary",
          },
        ],
        ...rows,
        [{ text: "🏠 خانه", action: callbackFor("home"), tone: "neutral" }],
      ],
    };
  });

  registerView("prediction.results", async () => {
    const contests = await db.predictionContest.findMany({
      where: { status: { in: ["resulted", "announced"] } },
      orderBy: { closesAt: "desc" },
      take: 10,
    });
    return {
      text: card(
        "📜 نتایج پیش‌بینی‌ها",
        contests.length ? contests.map((c: any) => `• ${c.title} · ${statusFa[c.status]}`) : ["هنوز نتیجه‌ای ثبت نشده است."],
      ),
      keyboard: [
        ...contests.map((c: any) => [
          {
            text: c.title,
            action: callbackFor("prediction.detail", { contestId: c.id }),
            tone: "primary" as const,
          },
        ]),
      ],
    };
  });

  registerView("prediction.detail", async (ctx, params) => {
    const user = ctx.from ? await UserService.findOrCreateUser(ctx) : undefined;
    const contest = await db.predictionContest.findUnique({
      where: { id: params.contestId },
      include: {
        options: { orderBy: { order: "asc" } },
        entries: user ? { where: { userId: user.id }, include: { option: true } } : true,
      },
    });
    if (!contest)
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
    const entry = user ? contest.entries[0] : undefined;
    const open = contest.status === "open" && new Date(contest.closesAt) > new Date();
    const archived = contest.status === "archived";
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
          `🎁 جایزه: ${PredictionService.rewardLabel(contest)}`,
          `🏆 تعداد برنده‌ها: ${contest.winnerCount.toLocaleString("fa-IR")}`,
          `⏳ مهلت: ${fmt(contest.closesAt)}`,
          `👥 شرکت‌کنندگان: ${contest.entries.length.toLocaleString("fa-IR")}`,
          entry
            ? `✅ انتخاب شما: ${entry.option?.title ?? "ثبت‌شده"}`
            : archived
              ? "آرشیوشده"
              : open
                ? "برای شرکت، یک گزینه را انتخاب کنید."
                : "⏳ زمان ثبت پیش‌بینی به پایان رسیده است.",
        ]),
      ]),
      keyboard: [...optionRows],
    };
  });

  registerView("admin.predictions", async () => {
    const [total, open, closed, resulted, announced, archived, entries] = await Promise.all([
      db.predictionContest.count(),
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
        [
          {
            text: "🔙 پنل مدیریت",
            action: callbackFor("admin.dashboard"),
            tone: "neutral",
          },
        ],
      ],
    };
  });

  registerView("admin.predictionList", async (_ctx, params) => {
    const where = params.status ? { status: params.status } : {};
    const contests = await db.predictionContest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    return {
      text: card("📋 لیست پیش‌بینی‌ها", contests.length ? contests.map((c: any) => `• ${c.title} · ${statusFa[c.status]}`) : ["موردی وجود ندارد."]),
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
      },
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
    const correct = c.entries.filter((e: any) => ["correct", "winner", "rewarded"].includes(e.status)).length;
    return {
      text: joinSections([
        card(`🔮 ${c.title}`, [
          `سؤال: ${c.question}`,
          `وضعیت: ${statusFa[c.status]}`,
          `زمان بسته شدن: ${fmt(c.closesAt)}`,
          `گزینه‌ها: ${c.options.map((o: any) => o.title).join("، ")}`,
          `شرکت‌کنندگان: ${c.entries.length.toLocaleString("fa-IR")}`,
          `درست: ${correct.toLocaleString("fa-IR")}`,
          `برنده‌ها: ${c.winners.length.toLocaleString("fa-IR")} از ${c.winnerCount.toLocaleString("fa-IR")}`,
          `جایزه: ${PredictionService.rewardLabel(c)}`,
          c.resultOptionId ? "نتیجه ثبت شده است." : "نتیجه هنوز ثبت نشده است.",
        ]),
      ]),
      keyboard: [
        [
          {
            text: "✏️ ویرایش عنوان",
            action: actionFor("flow:start", "prediction_title", c.id),
            tone: "primary",
          },
          {
            text: "📝 ویرایش توضیحات",
            action: actionFor("flow:start", "prediction_desc", c.id),
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
            action: actionFor("flow:start", "prediction_close", c.id),
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
            action: actionFor("flow:start", "prediction_reward", c.id),
            tone: "primary",
          },
          {
            text: "🔢 تغییر تعداد برنده‌ها",
            action: actionFor("flow:start", "prediction_winners", c.id),
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
        [
          {
            text: "🔙 لیست پیش‌بینی‌ها",
            action: callbackFor("admin.predictionList"),
            tone: "neutral",
          },
          {
            text: "🔮 مدیریت پیش‌بینی‌ها",
            action: callbackFor("admin.predictions"),
            tone: "neutral",
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
