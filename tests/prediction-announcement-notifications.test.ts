import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/services/prisma", () => ({
  prisma: {
    predictionContest: { findUnique: vi.fn(), update: vi.fn() },
    predictionWinner: { findMany: vi.fn(), update: vi.fn() },
    predictionAuditLog: { create: vi.fn() },
    product: { findUnique: vi.fn() },
  },
}));
vi.mock("../src/modules/wallet/wallet.service", () => ({ WalletService: { credit: vi.fn() } }));

import { prisma } from "../src/services/prisma";
import { PredictionService } from "../src/modules/prediction/prediction.service";

const db = prisma as any;
const contestTitle = "دربی تهران: پرسپولیس یا استقلال؟";
const userOption = "برد پرسپولیس";
const correctOption = "برد استقلال";

const makeText = (outcome: "winner" | "correct" | "wrong", rewardLabel = "💰 ۱۲۰٬۰۰۰ تومان شارژ کیف پول") =>
  PredictionService.buildResultNotification({ contestTitle, userOptionTitle: userOption, correctOptionTitle: correctOption, outcome, rewardLabel });

describe("prediction result notification copy", () => {
  it("non-winner notification has exactly one open predictions button", () => {
    const keyboard = [[PredictionService.resultNotificationButton()]];
    expect(keyboard.flat()).toHaveLength(1);
    expect(keyboard.flat()[0].text).toBe("🔮 پیش‌بینی‌های باز");
    expect(keyboard.flat()[0].view).toBe("prediction");
  });

  it("winner notification includes rewards and open predictions buttons", () => {
    const keyboard = PredictionService.winnerNotificationButtons();
    expect(keyboard).toHaveLength(2);
    expect(keyboard[0][0]).toMatchObject({ text: "🎁 جوایز من", view: "account.rewards", tone: "success" });
    expect(keyboard[1][0]).toMatchObject({ text: "🔮 پیش‌بینی‌های باز", view: "prediction", tone: "primary" });
  });

  it("winner notification includes contest title, user option, correct option and reward label", () => {
    const text = makeText("winner", "📦 اشتراک VIP ۳۰ روزه");
    expect(text).toContain(contestTitle);
    expect(text).toContain(userOption);
    expect(text).toContain(correctOption);
    expect(text).toContain("📦 اشتراک VIP ۳۰ روزه");
    expect(text).toContain("جایزه شما در بخش «جوایز من» آماده دریافت است.");
  });

  it("correct-not-winner notification includes contest title, user option and correct option", () => {
    const text = makeText("correct");
    expect(text).toContain(contestTitle);
    expect(text).toContain(userOption);
    expect(text).toContain(correctOption);
    expect(text).toContain("متأسفانه این بار جزو برنده‌ها نبودید.");
  });

  it("wrong notification includes contest title, user option and correct option", () => {
    const text = makeText("wrong");
    expect(text).toContain(contestTitle);
    expect(text).toContain(userOption);
    expect(text).toContain(correctOption);
  });

  it("no notification sends vague old text only", () => {
    for (const text of [makeText("winner"), makeText("correct"), makeText("wrong")]) {
      expect(text).not.toBe(["❌ پیش‌بینی شما درست نبود", ".", "\n", "شانس خودتان را در پیش‌بینی‌های بعدی امتحان کنید."].join(""));
      expect(text).not.toContain(["پیش‌بینی شما درست بود", "اما"].join("، "));
      expect(text).toContain("🔮 پیش‌بینی:");
    }
  });

  it("uses fallback when user option is missing", () => {
    expect(PredictionService.buildResultNotification({ contestTitle, correctOptionTitle: correctOption, outcome: "wrong" })).toContain("ثبت‌شده");
  });
});

describe("prediction announcement behavior", () => {
  beforeEach(() => vi.clearAllMocks());

  it("product reward notification shows product title", async () => {
    db.predictionContest.findUnique.mockResolvedValue({ id: "c1", title: contestTitle, resultOptionId: "o2", rewardType: "product", rewardProductId: "p1", entries: [{ id: "e1", userId: "u1", telegramId: "1", optionId: "o2", status: "correct", option: { title: correctOption } }], winners: [{ id: "w1", userId: "u1" }], options: [{ id: "o2", title: correctOption }] });
    db.predictionWinner.findMany.mockResolvedValue([{ id: "w1", userId: "u1" }]);
    db.product.findUnique.mockResolvedValue({ id: "p1", title: "اشتراک طلایی ۹۰ روزه" });
    const sent: string[] = [];
    await PredictionService.announcePredictionResults("c1", 1, async (_id, text) => { sent.push(text); });
    expect(sent[0]).toContain("📦 اشتراک طلایی ۹۰ روزه");
  });

  it("wallet reward notification shows wallet amount", async () => {
    db.predictionContest.findUnique.mockResolvedValue({ id: "c1", title: contestTitle, resultOptionId: "o2", rewardType: "wallet", rewardWalletAmount: 50000, entries: [{ id: "e1", userId: "u1", telegramId: "1", optionId: "o2", status: "correct", option: { title: correctOption } }], winners: [{ id: "w1", userId: "u1" }], options: [{ id: "o2", title: correctOption }] });
    db.predictionWinner.findMany.mockResolvedValue([{ id: "w1", userId: "u1" }]);
    const sent: string[] = [];
    await PredictionService.announcePredictionResults("c1", 1, async (_id, text) => { sent.push(text); });
    expect(sent[0]).toContain("💰 ۵۰٬۰۰۰ تومان شارژ کیف پول");
  });

  it("announcement does not proceed without result option", async () => {
    db.predictionContest.findUnique.mockResolvedValue({ id: "c1", resultOptionId: null, entries: [], winners: [], options: [] });
    await expect(PredictionService.announcePredictionResults("c1")).rejects.toThrow("⚠️ نتیجه پیش‌بینی هنوز ثبت نشده است.");
    expect(db.predictionContest.update).not.toHaveBeenCalled();
  });

  it("admin announcement summary includes counts", async () => {
    db.predictionContest.findUnique.mockResolvedValue({ id: "c1", title: contestTitle, resultOptionId: "o2", rewardType: "wallet", rewardWalletAmount: 50000, entries: [{ id: "e1", userId: "u1", telegramId: "1", optionId: "o2", status: "correct", option: { title: correctOption } }, { id: "e2", userId: "u2", telegramId: "2", optionId: "o1", status: "wrong", option: { title: userOption } }], winners: [{ id: "w1", userId: "u1" }], options: [{ id: "o2", title: correctOption }] });
    db.predictionWinner.findMany.mockResolvedValue([{ id: "w1", userId: "u1" }]);
    const result = await PredictionService.announcePredictionResults("c1", 1, async () => undefined);
    expect(result).toMatchObject({ totalParticipants: 2, correctCount: 1, wrongCount: 1, winnerCount: 1, sent: 2, failed: 0 });
  });

  it("announcement remains idempotent", async () => {
    db.predictionContest.findUnique.mockResolvedValue({ id: "c1", status: "announced", announcedAt: new Date(), resultOptionId: "o2", entries: [{ id: "e1" }], winners: [{ id: "w1" }], options: [{ id: "o2", title: correctOption }] });
    const notifier = vi.fn();
    const result = await PredictionService.announcePredictionResults("c1", 1, notifier);
    expect(result.alreadyAnnounced).toBe(true);
    expect(notifier).not.toHaveBeenCalled();
  });
});
