import { prisma } from "../../services/prisma";
import { WalletService } from "../wallet/wallet.service";

const db = prisma as any;

export const MISSING_REWARD_PRODUCT_LABEL = "📦 محصول حذف‌شده یا ناموجود";

export type PredictionRewardProduct = {
  id?: string;
  title?: string | null;
  price?: number | null;
  duration?: number | null;
  durationDays?: number | null;
  trafficBytes?: bigint | number | null;
  mode?: string | null;
  category?: { name?: string | null } | null;
};

export type PredictionContestWithReward = {
  rewardType?: string | null;
  rewardWalletAmount?: number | null;
  rewardProductId?: string | null;
  rewardProduct?: PredictionRewardProduct | null;
};

const money = (amount: number) => `${Number(amount ?? 0).toLocaleString("fa-IR")} تومان`;

const productDurationLabel = (product: PredictionRewardProduct) => {
  const days = product.durationDays ?? product.duration;
  return days ? `${Number(days).toLocaleString("fa-IR")} روز` : undefined;
};

const productTrafficLabel = (product: PredictionRewardProduct) => {
  if (product.trafficBytes === undefined || product.trafficBytes === null) return undefined;
  const bytes = typeof product.trafficBytes === "bigint" ? product.trafficBytes : BigInt(Math.max(0, Number(product.trafficBytes)));
  if (bytes <= 0n) return undefined;
  const gb = Number(bytes) / 1024 / 1024 / 1024;
  return `${gb.toLocaleString("fa-IR", { maximumFractionDigits: 1 })} گیگابایت`;
};

const productModeLabel = (mode?: string | null) => mode === "xray_auto" ? "ساخت خودکار از پنل" : mode === "manual_inventory" ? "تحویل از موجودی دستی" : undefined;

export type PredictionDraft = {
  title: string;
  question: string;
  description?: string;
  options: string[];
  rewardType: "wallet" | "product";
  rewardWalletAmount?: number;
  rewardProductId?: string;
  winnerCount: number;
  closesAt: Date;
};

export function parsePredictionCloseDate(
  input: string,
  now = new Date(),
): Date | null {
  const text = input.trim().replace(/،/g, ",");
  const relative = text.match(/^(امروز|فردا)\s+(\d{1,2}):(\d{2})$/);
  if (relative) {
    const date = new Date(now);
    if (relative[1] === "فردا") date.setDate(date.getDate() + 1);
    date.setHours(Number(relative[2]), Number(relative[3]), 0, 0);
    return date;
  }
  const absolute = text.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})$/);
  if (!absolute) return null;
  const date = new Date(
    `${absolute[1]}-${absolute[2]}-${absolute[3]}T${absolute[4].padStart(2, "0")}:${absolute[5]}:00+03:00`,
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

export function validatePredictionDraft(
  draft: Partial<PredictionDraft>,
  publish = false,
): string[] {
  const errors: string[] = [];
  if (
    !draft.title ||
    draft.title.trim().length < 3 ||
    draft.title.trim().length > 100
  )
    errors.push("عنوان باید بین ۳ تا ۱۰۰ کاراکتر باشد.");
  if (
    !draft.question ||
    draft.question.trim().length < 3 ||
    draft.question.trim().length > 200
  )
    errors.push("سؤال باید بین ۳ تا ۲۰۰ کاراکتر باشد.");
  if ((draft.description?.length ?? 0) > 1000)
    errors.push("توضیحات حداکثر ۱۰۰۰ کاراکتر است.");
  if (!draft.options || draft.options.length < 2)
    errors.push("حداقل ۲ گزینه لازم است.");
  if ((draft.options?.length ?? 0) > 10)
    errors.push("حداکثر ۱۰ گزینه مجاز است.");
  if (draft.options?.some((o) => !o.trim() || o.trim().length > 64))
    errors.push("عنوان هر گزینه باید بین ۱ تا ۶۴ کاراکتر باشد.");
  if (!draft.winnerCount || draft.winnerCount < 1)
    errors.push("تعداد برنده‌ها باید عددی مثبت باشد.");
  if (
    draft.rewardType === "wallet" &&
    (!draft.rewardWalletAmount || draft.rewardWalletAmount <= 0)
  )
    errors.push("مبلغ شارژ کیف پول باید مثبت باشد.");
  if (draft.rewardType === "product" && !draft.rewardProductId)
    errors.push("محصول جایزه را انتخاب کنید.");
  if (publish && (!draft.closesAt || draft.closesAt <= new Date()))
    errors.push("زمان بسته شدن باید در آینده باشد.");
  return errors;
}


export type PredictionDisplayStatus = "open" | "waiting_result" | "resulted" | "announced" | "archived";

export type PredictionStatusContest = {
  status?: string | null;
  closesAt?: Date | string | null;
  resultOptionId?: string | null;
  announcedAt?: Date | string | null;
  archivedAt?: Date | string | null;
};

export function getPredictionDisplayStatus(contest: PredictionStatusContest, now = new Date()): PredictionDisplayStatus {
  if (contest.status === "archived" || contest.archivedAt) return "archived";
  if (contest.status === "announced" || contest.announcedAt) return "announced";
  if (contest.status === "resulted" || contest.resultOptionId) return "resulted";
  const closesAt = contest.closesAt ? new Date(contest.closesAt) : undefined;
  if (contest.status === "open" && closesAt && closesAt > now) return "open";
  return "waiting_result";
}

export function canSubmitPrediction(contest: PredictionStatusContest, now = new Date()): boolean {
  const closesAt = contest.closesAt ? new Date(contest.closesAt) : undefined;
  return contest.status === "open" && Boolean(closesAt && closesAt > now) && getPredictionDisplayStatus(contest, now) !== "archived";
}

export const predictionDisplayStatusFa: Record<PredictionDisplayStatus, string> = {
  open: "🟢 باز برای شرکت",
  waiting_result: "⏳ در انتظار اعلام نتیجه",
  resulted: "🏁 نتیجه ثبت شده",
  announced: "📣 نتیجه اعلام شده",
  archived: "🗄 آرشیوشده",
};

export type PredictionDeleteMode =
  | "hard_delete_allowed"
  | "archive_required"
  | "blocked_due_to_claimed_rewards";

export class PredictionService {
  static async createContest(
    draft: PredictionDraft,
    adminTelegramId?: number | string,
    publish = true,
  ) {
    const errors = validatePredictionDraft(draft, publish);
    if (errors.length) throw new Error(errors.join("\n"));
    return db.predictionContest.create({
      data: {
        title: draft.title.trim(),
        question: draft.question.trim(),
        description: draft.description?.trim() || null,
        status: publish ? "open" : "draft",
        closesAt: draft.closesAt,
        winnerCount: draft.winnerCount,
        rewardType: draft.rewardType,
        rewardWalletAmount: draft.rewardWalletAmount ?? null,
        rewardProductId: draft.rewardProductId ?? null,
        createdByAdminTelegramId: adminTelegramId
          ? String(adminTelegramId)
          : null,
        options: {
          create: draft.options.map((title, order) => ({
            title: title.trim(),
            order,
          })),
        },
        auditLogs: {
          create: {
            adminTelegramId: adminTelegramId ? String(adminTelegramId) : null,
            action: publish ? "publish" : "draft",
            metadata: { title: draft.title },
          },
        },
      },
      include: { options: true },
    });
  }

  static async closeExpired(now = new Date()) {
    return db.predictionContest.updateMany({
      where: { status: "open", closesAt: { lte: now } },
      data: { status: "closed" },
    });
  }

  static async submitPrediction(
    contestId: string,
    optionId: string,
    user: { id: string; telegramId: string },
  ) {
    const contest = await db.predictionContest.findUnique({
      where: { id: contestId },
    });
    if (contest?.status === "archived")
      throw new Error(
        "❌ این پیش‌بینی آرشیو شده و امکان ثبت پیش‌بینی جدید وجود ندارد.",
      );
    if (!contest || !canSubmitPrediction(contest, new Date()))
      throw new Error("⏳ زمان ثبت پیش‌بینی به پایان رسیده است.");
    const existing = await db.predictionEntry.findUnique({
      where: { contestId_userId: { contestId, userId: user.id } },
    });
    if (existing && !contest.allowUserEdit)
      throw new Error("پیش‌بینی شما قبلاً ثبت شده است.");
    if (existing)
      return db.predictionEntry.update({
        where: { id: existing.id },
        data: { optionId, status: "submitted" },
      });
    return db.predictionEntry.create({
      data: {
        contestId,
        optionId,
        userId: user.id,
        telegramId: user.telegramId,
        status: "submitted",
      },
    });
  }

  static async setResult(
    contestId: string,
    optionId: string,
    adminTelegramId?: number | string,
  ) {
    return db.$transaction(async (tx: any) => {
      await tx.predictionContest.update({
        where: { id: contestId },
        data: {
          status: "resulted",
          resultOptionId: optionId,
          resultedAt: new Date(),
        },
      });
      await tx.predictionEntry.updateMany({
        where: { contestId, optionId },
        data: { status: "correct" },
      });
      await tx.predictionEntry.updateMany({
        where: { contestId, optionId: { not: optionId } },
        data: { status: "wrong" },
      });
      await tx.predictionAuditLog.create({
        data: {
          contestId,
          adminTelegramId: adminTelegramId ? String(adminTelegramId) : null,
          action: "result.set",
          metadata: { optionId },
        },
      });
    });
  }

  static async selectWinners(contestId: string) {
    const existing = await db.predictionWinner.findMany({
      where: { contestId },
    });
    if (existing.length) return existing;
    const contest = await db.predictionContest.findUnique({
      where: { id: contestId },
    });
    if (!contest?.resultOptionId) throw new Error("ابتدا نتیجه را ثبت کنید.");
    if (contest.status === "open" && contest.closesAt > new Date())
      throw new Error("پیش‌بینی هنوز باز است.");
    const candidates = await db.predictionEntry.findMany({
      where: { contestId, status: "correct" },
    });
    const shuffled = [...candidates]
      .sort(() => Math.random() - 0.5)
      .slice(0, contest.winnerCount);
    return db.$transaction(async (tx: any) => {
      const winners = [];
      for (const entry of shuffled) {
        await tx.predictionEntry.update({
          where: { id: entry.id },
          data: { status: "winner" },
        });
        winners.push(
          await tx.predictionWinner.create({
            data: {
              contestId,
              entryId: entry.id,
              userId: entry.userId,
              telegramId: entry.telegramId,
              rewardType: contest.rewardType,
              rewardWalletAmount: contest.rewardWalletAmount,
              rewardProductId: contest.rewardProductId,
              status: "selected",
            },
          }),
        );
      }
      return winners;
    });
  }

  static async claimReward(winnerId: string, telegramId: string) {
    return db.$transaction(async (tx: any) => {
      const winner = await tx.predictionWinner.findUnique({
        where: { id: winnerId },
      });
      if (!winner || winner.telegramId !== String(telegramId))
        throw new Error("جایزه‌ای برای شما پیدا نشد.");
      if (winner.status === "claimed") return { alreadyClaimed: true };
      const contest = await tx.predictionContest.findUnique({
        where: { id: winner.contestId },
      });
      if (winner.rewardType === "wallet")
        await WalletService.credit(
          winner.userId,
          winner.rewardWalletAmount ?? 0,
          `جایزه پیش‌بینی: ${contest?.title ?? "پیش‌بینی"}`,
          tx,
          { actorId: "system", referenceId: `prediction:${winner.id}` },
        );
      // Product rewards are marked claimed here and can be fulfilled by existing delivery/order tooling from audit trail.
      await tx.predictionWinner.update({
        where: { id: winner.id },
        data: { status: "claimed", claimedAt: new Date() },
      });
      await tx.predictionEntry.update({
        where: { id: winner.entryId },
        data: { status: "rewarded", rewardClaimedAt: new Date() },
      });
      return { alreadyClaimed: false };
    });
  }

  static async canHardDeletePrediction(contestId: string) {
    const contest = await db.predictionContest.findUnique({
      where: { id: contestId },
      include: { entries: true, winners: true, auditLogs: true },
    });
    if (!contest) return false;
    const rewardsClaimed = contest.winners.some(
      (w: any) => w.status === "claimed" || w.claimedAt,
    );
    const announcementsSent =
      Boolean(contest.announcedAt) ||
      contest.status === "announced" ||
      contest.auditLogs.some((l: any) => String(l.action).includes("announce"));
    return (
      contest.entries.length === 0 &&
      contest.winners.length === 0 &&
      !contest.resultOptionId &&
      !contest.resultedAt &&
      !rewardsClaimed &&
      !announcementsSent
    );
  }

  static async getPredictionDeleteMode(
    contestId: string,
  ): Promise<PredictionDeleteMode> {
    const contest = await db.predictionContest.findUnique({
      where: { id: contestId },
      include: { entries: true, winners: true, auditLogs: true },
    });
    if (!contest) return "blocked_due_to_claimed_rewards";
    return (await this.canHardDeletePrediction(contestId))
      ? "hard_delete_allowed"
      : "archive_required";
  }

  static async archivePrediction(contestId: string, adminId?: number | string) {
    return db.$transaction(async (tx: any) => {
      const archivedAt = new Date();
      const contest = await tx.predictionContest.update({
        where: { id: contestId },
        data: { status: "archived", archivedAt },
      });
      await tx.predictionAuditLog.create({
        data: {
          contestId,
          adminTelegramId: adminId ? String(adminId) : null,
          action: "PREDICTION_ARCHIVED",
          metadata: { archivedAt: archivedAt.toISOString() },
        },
      });
      return contest;
    });
  }

  static async hardDeletePrediction(
    contestId: string,
    adminId?: number | string,
  ) {
    return db.$transaction(async (tx: any) => {
      const contest = await tx.predictionContest.findUnique({
        where: { id: contestId },
        include: { entries: true, winners: true, auditLogs: true },
      });
      const safe =
        contest &&
        contest.entries.length === 0 &&
        contest.winners.length === 0 &&
        !contest.resultOptionId &&
        !contest.resultedAt &&
        !contest.announcedAt &&
        contest.status !== "announced" &&
        !contest.auditLogs.some((l: any) =>
          String(l.action).includes("announce"),
        );
      if (!safe) {
        await tx.predictionAuditLog.create({
          data: {
            contestId,
            adminTelegramId: adminId ? String(adminId) : null,
            action: "PREDICTION_DELETE_BLOCKED",
            metadata: { reason: "unsafe_for_hard_delete" },
          },
        });
        throw new Error("حذف کامل این پیش‌بینی امن نیست؛ آن را آرشیو کنید.");
      }
      await tx.predictionAuditLog.create({
        data: {
          contestId,
          adminTelegramId: adminId ? String(adminId) : null,
          action: "PREDICTION_HARD_DELETED",
          metadata: { title: contest.title },
        },
      });
      await tx.predictionAuditLog.deleteMany({ where: { contestId } });
      await tx.predictionOption.deleteMany({ where: { contestId } });
      return tx.predictionContest.delete({ where: { id: contestId } });
    });
  }

  static async getRewardProduct(productId?: string | null) {
    if (!productId) return null;
    return db.product.findUnique({
      where: { id: productId },
      include: { category: true },
    });
  }

  static async getRewardProductsById(productIds: Array<string | null | undefined>) {
    const ids = [...new Set(productIds.filter(Boolean).map(String))];
    if (!ids.length) return new Map<string, PredictionRewardProduct>();
    const products = await db.product.findMany({
      where: { id: { in: ids } },
      include: { category: true },
    });
    return new Map(products.map((product: PredictionRewardProduct) => [String(product.id), product]));
  }

  static attachRewardProduct<T extends PredictionContestWithReward>(contest: T, product?: PredictionRewardProduct | null): T {
    return { ...contest, rewardProduct: product ?? contest.rewardProduct ?? null };
  }

  static rewardLabel(contest: PredictionContestWithReward) {
    if (contest.rewardType === "wallet") {
      return `💰 ${money(Number(contest.rewardWalletAmount ?? 0))} شارژ کیف پول`;
    }
    if (contest.rewardType === "product") {
      return contest.rewardProduct?.title ? `📦 ${contest.rewardProduct.title}` : MISSING_REWARD_PRODUCT_LABEL;
    }
    return "🎁 جایزه نامشخص";
  }

  static rewardDetails(contest: PredictionContestWithReward, view: "user" | "admin" = "user") {
    if (contest.rewardType === "wallet") return [`🎁 جایزه: ${this.rewardLabel(contest)}`];
    if (contest.rewardType !== "product") return ["🎁 جایزه نامشخص"];

    const product = contest.rewardProduct;
    if (!product?.title) {
      return view === "admin"
        ? ["🎁 جایزه محصولی", "⚠️ محصول جایزه پیدا نشد. لطفاً جایزه را دوباره انتخاب کنید."]
        : [`🎁 جایزه: ${MISSING_REWARD_PRODUCT_LABEL}`];
    }

    if (view === "admin") {
      return [
        "🎁 جایزه محصولی",
        `📦 محصول: ${product.title}`,
        `🏷 دسته‌بندی: ${product.category?.name ?? "نامشخص"}`,
        product.price !== undefined && product.price !== null ? `💰 ارزش محصول: ${money(Number(product.price))}` : undefined,
        productDurationLabel(product) ? `📅 اعتبار: ${productDurationLabel(product)}` : undefined,
        productTrafficLabel(product) ? `📊 حجم: ${productTrafficLabel(product)}` : undefined,
        productModeLabel(product.mode) ? `⚙️ نوع تحویل: ${productModeLabel(product.mode)}` : undefined,
      ].filter(Boolean) as string[];
    }

    return [
      `🎁 جایزه: 📦 ${product.title}`,
      productDurationLabel(product) ? `📅 اعتبار: ${productDurationLabel(product)}` : undefined,
      productTrafficLabel(product) ? `📊 حجم: ${productTrafficLabel(product)}` : undefined,
    ].filter(Boolean) as string[];
  }
}
