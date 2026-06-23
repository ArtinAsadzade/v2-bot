import { beforeEach, describe, expect, test, vi } from "vitest";
import { handleActiveFlowText, startFlow } from "../src/bot/flows/flow-engine";
import { registerView } from "../src/bot/navigation/panel-ui";
import { PredictionService } from "../src/modules/prediction/prediction.service";
import type { AppContext } from "../src/types/bot";

function ctx(): AppContext {
  const replies: any[] = [];
  return {
    session: { navigation: { stack: [{ id: "admin.predictions" }] } },
    from: { id: 123 },
    reply: vi.fn(async (text: string, extra?: any) => { replies.push({ text, extra }); return {} as any; }),
    editMessageText: vi.fn(async () => ({})),
    telegram: { sendMessage: vi.fn(async () => ({})) },
    __replies: replies,
  } as any;
}
const texts = (c: any) => c.__replies.map((r: any) => String(r.text));
const last = (c: any) => texts(c).at(-1) ?? "";

async function start(c: AppContext) { await startFlow(c, "prediction_create"); }

describe("prediction create flow", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    registerView("admin.predictions", async () => ({ text: "🔮 مدیریت پیش‌بینی‌ها", keyboard: [] }));
    registerView("admin.predictionDetail", async () => ({ text: "جزئیات پیش‌بینی", keyboard: [] }));
  });

  test("question step advances and does not repeat question after valid input", async () => {
    const c = ctx(); await start(c);
    await handleActiveFlowText(c, "عنوان خوب");
    expect(c.session.flow?.step).toBe("question");
    expect(last(c)).toContain("سؤال پیش‌بینی را ارسال کنید");
    await handleActiveFlowText(c, "نتیجه بازی چیست؟");
    expect(c.session.flow?.step).toBe("description");
    expect(last(c)).toContain("توضیحات پیش‌بینی را ارسال کنید");
    expect(last(c)).not.toContain("سؤال پیش‌بینی را ارسال کنید");
  });

  test("title validation keeps title step then valid title moves to question", async () => {
    const c = ctx(); await start(c);
    await handleActiveFlowText(c, "اب");
    expect(c.session.flow?.step).toBe("title");
    expect(last(c)).toContain("عنوان باید بین");
    await handleActiveFlowText(c, "عنوان معتبر");
    expect(c.session.flow?.step).toBe("question");
  });

  test("question validation keeps question step then valid question moves to description", async () => {
    const c = ctx(); await start(c); await handleActiveFlowText(c, "عنوان معتبر");
    await handleActiveFlowText(c, "؟");
    expect(c.session.flow?.step).toBe("question");
    expect(last(c)).toContain("سؤال باید بین");
    await handleActiveFlowText(c, "چه کسی برنده است؟");
    expect(c.session.flow?.step).toBe("description");
  });

  test("description skip moves to options", async () => {
    const c = ctx(); await start(c); await handleActiveFlowText(c, "عنوان معتبر"); await handleActiveFlowText(c, "چه کسی برنده است؟");
    await handleActiveFlowText(c, "⏭ رد کردن توضیحات");
    expect(c.session.flow?.step).toBe("options");
    expect(c.session.predictionCreate?.description).toBe("");
    expect(last(c)).toContain("گزینه اول را ارسال کنید");
  });

  test("options save, duplicate is rejected and max 10 options is enforced", async () => {
    const c = ctx(); await start(c); await handleActiveFlowText(c, "عنوان معتبر"); await handleActiveFlowText(c, "چه کسی برنده است؟"); await handleActiveFlowText(c, "ندارد");
    await handleActiveFlowText(c, "گزینه یک");
    await handleActiveFlowText(c, "گزینه دو");
    expect(c.session.predictionCreate?.options).toEqual(["گزینه یک", "گزینه دو"]);
    expect(JSON.stringify((c as any).__replies.at(-1).extra)).toContain("✅ پایان گزینه‌ها");
    await handleActiveFlowText(c, "گزینه دو");
    expect(last(c)).toContain("گزینه تکراری است");
    for (let i = 3; i <= 10; i++) await handleActiveFlowText(c, `گزینه ${i}`);
    await handleActiveFlowText(c, "گزینه ۱۱");
    expect(last(c)).toContain("حداکثر ۱۰ گزینه");
  });

  test("full happy path publishes prediction", async () => {
    const spy = vi.spyOn(PredictionService, "createContest").mockResolvedValue({ id: "contest1" } as any);
    const c = ctx(); await start(c);
    for (const input of ["عنوان معتبر", "چه کسی برنده است؟", "توضیح تست", "گزینه یک", "گزینه دو", "پایان گزینه‌ها", "کیف پول", "50000", "1", "2099-06-26 23:59", "انتشار"]) await handleActiveFlowText(c, input);
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ title: "عنوان معتبر", question: "چه کسی برنده است؟", options: ["گزینه یک", "گزینه دو"], rewardType: "wallet", rewardWalletAmount: 50000, winnerCount: 1 }), 123, true);
    expect(c.session.flow).toBeUndefined();
    expect(c.session.predictionCreate).toBeUndefined();
    expect(texts(c).join("\n")).toContain("✅ پیش‌بینی منتشر شد");
  });

  test("cancel clears draft and returns to admin prediction dashboard", async () => {
    const c = ctx(); await start(c); await handleActiveFlowText(c, "عنوان معتبر");
    await handleActiveFlowText(c, "❌ لغو ساخت پیش‌بینی");
    expect(c.session.flow).toBeUndefined();
    expect(c.session.predictionCreate).toBeUndefined();
    expect(last(c)).toContain("مدیریت پیش‌بینی‌ها");
  });

  test("unknown step clears corrupted session with Persian error", async () => {
    const c = ctx(); await start(c); c.session.flow!.step = "prediction_question";
    await handleActiveFlowText(c, "anything");
    expect(c.session.flow).toBeUndefined();
    expect(c.session.predictionCreate).toBeUndefined();
    expect(texts(c).join("\n")).toContain("⚠️ ساخت پیش‌بینی ناقص مانده است");
  });
});
