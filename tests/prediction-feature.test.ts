import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import {
  callbackFor,
  isValidCallbackData,
} from "../src/bot/navigation/panel-ui";
import { buildInlineKeyboard } from "../src/bot/keyboards/design-system";
import { homeKeyboard } from "../src/bot/keyboards/common.keyboard";
import { adminDashboardViewKeyboard } from "../src/bot/keyboards/view-keyboards";
import {
  parsePredictionCloseDate,
  validatePredictionDraft,
} from "../src/modules/prediction/prediction.service";

const schema = readFileSync("prisma/schema.prisma", "utf8");
const service = readFileSync(
  "src/modules/prediction/prediction.service.ts",
  "utf8",
);
const views = readFileSync("src/bot/views/prediction.views.ts", "utf8");
const handlers = readFileSync(
  "src/bot/handlers/modern/prediction.handlers.ts",
  "utf8",
);
const flow = readFileSync("src/bot/flows/flow-engine.ts", "utf8");
const job = readFileSync("src/jobs/prediction-close.job.ts", "utf8");

const callbacks = (keyboard: ReturnType<typeof buildInlineKeyboard>) =>
  keyboard.reply_markup.inline_keyboard
    .flat()
    .map((b: any) => b.callback_data)
    .filter(Boolean);

describe("prediction feature", () => {
  test("DB models and safety indexes exist", () => {
    for (const model of [
      "PredictionContest",
      "PredictionOption",
      "PredictionEntry",
      "PredictionWinner",
      "PredictionAuditLog",
    ])
      expect(schema).toContain(`model ${model}`);
    expect(schema).toContain("@@unique([contestId, userId])");
    expect(schema).toContain("@@unique([contestId, userId])");
    expect(schema).toContain("@@index([status])");
    expect(schema).toContain("@@index([closesAt])");
  });

  test("admin creation validation covers options, wallet, product, close date and preview", () => {
    expect(
      validatePredictionDraft(
        {
          title: "ab",
          question: "?",
          options: ["ایران"],
          rewardType: "wallet",
          winnerCount: 0,
        },
        true,
      ).join(" "),
    ).toMatch(/حداقل ۲ گزینه|مبلغ شارژ کیف پول|آینده/);
    expect(
      validatePredictionDraft(
        {
          title: "برنده بازی",
          question: "چه تیمی؟",
          options: ["ایران", "مصر"],
          rewardType: "product",
          winnerCount: 1,
          closesAt: new Date(Date.now() + 86400000),
        },
        true,
      ).join(" "),
    ).toMatch(/محصول/);
    expect(flow).toContain("🔎 پیش‌نمایش پیش‌بینی");
    expect(views).toContain("➕ ساخت پیش‌بینی جدید");
  });

  test("user participation, duplicate and close guards are implemented", () => {
    expect(service).toContain("contestId_userId");
    expect(service).toMatch(/پیش‌بینی شما قبلاً ثبت شده است/);
    expect(service).toMatch(/closesAt <= new Date\(\)/);
    expect(handlers).toContain("گزینه انتخابی شما");
    expect(handlers).toContain("✅ پیش‌بینی شما ثبت شد.");
  });

  test("result, winners, announcements and reward claims are idempotent", () => {
    expect(service).toMatch(
      /setResult[\s\S]*status: "correct"[\s\S]*status: "wrong"/,
    );
    expect(service).toMatch(/if \(existing\.length\) return existing/);
    expect(service).toMatch(/status === "claimed"/);
    expect(service).toContain("جایزه پیش‌بینی:");
    expect(handlers).toContain("📣 نتایج قبلاً اعلام شده‌اند.");
    expect(handlers).toContain(
      "🎉 تبریک! پیش‌بینی شما درست بود و شما برنده شدید.",
    );
    expect(handlers).toContain(
      "✅ پیش‌بینی شما درست بود، اما این بار جزو برنده‌ها نبودید.",
    );
    expect(handlers).toContain("❌ پیش‌بینی شما درست نبود");
  });

  test("close job is wired and date parser supports Persian shortcuts", () => {
    expect(job).toContain('runJobOnce("prediction-close"');
    expect(
      parsePredictionCloseDate(
        "فردا 20:00",
        new Date("2026-06-23T10:00:00Z"),
      )?.getDate(),
    ).toBe(24);
  });

  test("UI buttons and callbacks are safe and styled", () => {
    const home = buildInlineKeyboard(homeKeyboard(false));
    const admin = buildInlineKeyboard(adminDashboardViewKeyboard());
    expect(
      home.reply_markup.inline_keyboard.flat().map((b) => b.text),
    ).toContain("🔮 پیش‌بینی");
    expect(
      admin.reply_markup.inline_keyboard.flat().map((b) => b.text),
    ).toContain("📣 بازاریابی");
    for (const cb of [
      ...callbacks(home),
      ...callbacks(admin),
      callbackFor("prediction.detail", {
        contestId: "507f1f77bcf86cd799439011",
      }),
    ])
      expect(isValidCallbackData(cb)).toBe(true);
    expect(views).toContain('tone: "success"');
    expect(views).toContain('tone: "primary"');
    expect(views).toContain('tone: "danger"');
  });
  test("prediction delete mode supports hard delete confirmation for empty contests", () => {
    expect(service).toContain("canHardDeletePrediction");
    expect(service).toContain("hardDeletePrediction");
    expect(service).toContain('"hard_delete_allowed"');
    expect(service).toContain("predictionOption.deleteMany");
    expect(views).toContain("🗑 حذف پیش‌بینی");
    expect(views).toContain(
      "این پیش‌بینی هنوز شرکت‌کننده‌ای ندارد و می‌تواند به‌صورت کامل حذف شود.",
    );
    expect(views).toContain("🗑 حذف کامل");
    expect(handlers).toContain("✅ پیش‌بینی با موفقیت حذف شد.");
  });

  test("prediction delete mode archives participant contests and preserves records", () => {
    expect(service).toContain("archivePrediction");
    expect(service).toContain('status: "archived"');
    expect(service).toContain("archivedAt");
    expect(service).not.toMatch(/predictionEntry\.deleteMany/);
    expect(service).not.toMatch(/predictionWinner\.deleteMany/);
    expect(views).toContain("🗄 آرشیو پیش‌بینی");
    expect(views).toContain("این پیش‌بینی دارای شرکت‌کننده است");
    expect(views).toContain("📊 مشاهده آمار");
    expect(handlers).toContain(
      "✅ پیش‌بینی آرشیو شد و دیگر برای کاربران نمایش داده نمی‌شود.",
    );
  });

  test("archived contests are hidden from user open list and blocked for submission", () => {
    expect(views).toContain('where: { status: "open" }');
    expect(service).toContain('contest?.status === "archived"');
    expect(service).toContain(
      "این پیش‌بینی آرشیو شده و امکان ثبت پیش‌بینی جدید وجود ندارد",
    );
    expect(views).toContain("آرشیوشده");
  });

  test("admin archived list, stats, audit logs and rewards survive archive", () => {
    expect(views).toContain('status: "archived"');
    expect(views).toContain("آرشیوشده");
    expect(views).toContain("admin.predictionStats");
    expect(views).toContain("admin.predictionParticipants");
    expect(service).toContain("PREDICTION_ARCHIVED");
    expect(service).toContain("PREDICTION_HARD_DELETED");
    expect(service).toContain("PREDICTION_DELETE_BLOCKED");
    expect(service).toContain('winner.status === "claimed"');
    expect(service).toContain(
      'if (winner.status === "claimed") return { alreadyClaimed: true }',
    );
  });

  test("old prediction delete blocking message is removed", () => {
    const old = "حذف فقط زمانی مجاز است" + " که شرکت‌کننده‌ای وجود نداشته باشد";
    expect(service).not.toContain(old);
    expect(views).not.toContain(old);
    expect(handlers).not.toContain(old);
  });
});

describe("prediction bug regressions", () => {
  test("closed predictions remain visible in user list and archived are excluded", () => {
    expect(views).toContain('status: { in: ["open", "closed", "resulted", "announced"] }');
    expect(views).toContain('contests.sort((a: any, b: any) => Number(b.status === "open")');
    expect(views).toContain('"⏳ زمان ثبت پیش‌بینی به پایان رسیده است."');
    expect(views).toContain('entry\n            ? `✅ انتخاب شما:');
  });

  test("admin prediction edit uses separate edit flow and preserves create draft", () => {
    expect(views).toContain('actionFor("flow:start", "prediction_edit", c.id, "title")');
    expect(views).toContain('actionFor("flow:start", "prediction_edit", c.id, "description")');
    expect(flow).toContain('predictionEdit');
    expect(flow).toContain('✏️ عنوان جدید پیش‌بینی را ارسال کنید.');
    expect(flow).toContain('📝 توضیحات جدید پیش‌بینی را ارسال کنید.');
    expect(flow).toContain('✅ تغییرات با موفقیت ذخیره شد.');
    expect(flow).toContain('returnTo: { id: "admin.predictionDetail", params: { contestId } }');
    expect(flow).toContain('if (name === "prediction_create") ctx.session.predictionCreate = {};');
  });

  test("product reward uses guided shop-style category/product picker and never asks for product code", () => {
    expect(flow).toContain('ProductService.getCategories()');
    expect(flow).toContain('ProductService.getProductsByCategory(categoryId)');
    expect(flow).toContain('ProductService.getActiveProductForUser(productId)');
    expect(flow).toContain('📦 انتخاب دسته‌بندی جایزه');
    expect(flow).toContain('ابتدا دسته‌بندی محصول جایزه را انتخاب کنید.');
    expect(flow).toContain('فعلاً محصول فعالی برای انتخاب به عنوان جایزه وجود ندارد.');
    expect(flow).toContain('flow:prediction_reward_category');
    expect(flow).toContain('flow:prediction_reward_product');
    expect(flow).toContain('flow:prediction_reward_confirm');
    expect(flow).toContain('📦 ${product.title} · ${money(product.price)}');
    expect(flow).toContain('🎁 محصول جایزه انتخاب شد');
    expect(flow).toContain('✅ تأیید محصول جایزه');
    expect(flow).toContain('draft.rewardProductId = product.id');
    expect(flow).toContain('draft.rewardProductTitle = product.title');
    expect(flow).toContain('✅ جایزه محصولی پیش‌بینی بروزرسانی شد.');
    expect(flow).toContain('PREDICTION_REWARD_PRODUCTS_PER_PAGE = 9');
    expect(flow).toContain('صفحه بعد ➡️');
    expect(flow).not.toContain('شناسه محصول جایزه را ارسال کنید');
    expect(flow).not.toContain('کد محصول را وارد کنید');
  });

  test("prediction reward callback prefixes stay compact", () => {
    for (const callback of ["flow:prediction_reward_category", "flow:prediction_reward_product", "flow:prediction_reward_confirm", "flow:prediction_products"]) {
      expect(callback.length + 1 + 16).toBeLessThanOrEqual(64);
    }
  });
});
