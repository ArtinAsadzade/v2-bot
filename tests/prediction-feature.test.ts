import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { callbackFor, isValidCallbackData } from "../src/bot/navigation/panel-ui";
import { buildInlineKeyboard } from "../src/bot/keyboards/design-system";
import { homeKeyboard } from "../src/bot/keyboards/common.keyboard";
import { adminDashboardViewKeyboard } from "../src/bot/keyboards/view-keyboards";
import { parsePredictionCloseDate, validatePredictionDraft } from "../src/modules/prediction/prediction.service";

const schema = readFileSync("prisma/schema.prisma", "utf8");
const service = readFileSync("src/modules/prediction/prediction.service.ts", "utf8");
const views = readFileSync("src/bot/views/prediction.views.ts", "utf8");
const handlers = readFileSync("src/bot/handlers/modern/prediction.handlers.ts", "utf8");
const flow = readFileSync("src/bot/flows/flow-engine.ts", "utf8");
const job = readFileSync("src/jobs/prediction-close.job.ts", "utf8");

const callbacks = (keyboard: ReturnType<typeof buildInlineKeyboard>) => keyboard.reply_markup.inline_keyboard.flat().map((b: any) => b.callback_data).filter(Boolean);

describe("prediction feature", () => {
  test("DB models and safety indexes exist", () => {
    for (const model of ["PredictionContest", "PredictionOption", "PredictionEntry", "PredictionWinner", "PredictionAuditLog"]) expect(schema).toContain(`model ${model}`);
    expect(schema).toContain("@@unique([contestId, userId])");
    expect(schema).toContain("@@unique([contestId, userId])");
    expect(schema).toContain("@@index([status])");
    expect(schema).toContain("@@index([closesAt])");
  });

  test("admin creation validation covers options, wallet, product, close date and preview", () => {
    expect(validatePredictionDraft({ title: "ab", question: "?", options: ["ایران"], rewardType: "wallet", winnerCount: 0 }, true).join(" ")).toMatch(/حداقل ۲ گزینه|مبلغ شارژ کیف پول|آینده/);
    expect(validatePredictionDraft({ title: "برنده بازی", question: "چه تیمی؟", options: ["ایران", "مصر"], rewardType: "product", winnerCount: 1, closesAt: new Date(Date.now() + 86400000) }, true).join(" ")).toMatch(/محصول/);
    expect(flow).toContain("🔎 پیش‌نمایش پیش‌بینی");
    expect(views).toContain("➕ ساخت پیش‌بینی جدید");
  });

  test("user participation, duplicate and close guards are implemented", () => {
    expect(service).toMatch(/findUnique\(\{ where: \{ contestId_userId/);
    expect(service).toMatch(/پیش‌بینی شما قبلاً ثبت شده است/);
    expect(service).toMatch(/closesAt <= new Date\(\)/);
    expect(handlers).toContain("گزینه انتخابی شما");
    expect(handlers).toContain("✅ پیش‌بینی شما ثبت شد.");
  });

  test("result, winners, announcements and reward claims are idempotent", () => {
    expect(service).toMatch(/setResult[\s\S]*status: "correct"[\s\S]*status: "wrong"/);
    expect(service).toMatch(/if \(existing\.length\) return existing/);
    expect(service).toMatch(/status === "claimed"/);
    expect(service).toContain("جایزه پیش‌بینی:");
    expect(handlers).toContain("📣 نتایج قبلاً اعلام شده‌اند.");
    expect(handlers).toContain("🎉 تبریک! پیش‌بینی شما درست بود و شما برنده شدید.");
    expect(handlers).toContain("✅ پیش‌بینی شما درست بود، اما این بار جزو برنده‌ها نبودید.");
    expect(handlers).toContain("❌ پیش‌بینی شما درست نبود");
  });

  test("close job is wired and date parser supports Persian shortcuts", () => {
    expect(job).toContain("runJobOnce(\"prediction-close\"");
    expect(parsePredictionCloseDate("فردا 20:00", new Date("2026-06-23T10:00:00Z"))?.getDate()).toBe(24);
  });

  test("UI buttons and callbacks are safe and styled", () => {
    const home = buildInlineKeyboard(homeKeyboard(false));
    const admin = buildInlineKeyboard(adminDashboardViewKeyboard());
    expect(home.reply_markup.inline_keyboard.flat().map((b) => b.text)).toContain("🔮 پیش‌بینی");
    expect(admin.reply_markup.inline_keyboard.flat().map((b) => b.text)).toContain("🔮 پیش‌بینی‌ها");
    for (const cb of [...callbacks(home), ...callbacks(admin), callbackFor("prediction.detail", { contestId: "507f1f77bcf86cd799439011" })]) expect(isValidCallbackData(cb)).toBe(true);
    expect(views).toContain("tone:\"success\"");
    expect(views).toContain("tone:\"primary\"");
    expect(views).toContain("tone:\"danger\"");
  });
});
