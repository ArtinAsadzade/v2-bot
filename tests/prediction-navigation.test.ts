import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findMany: vi.fn() }));
const { findMany } = mocks;

vi.mock("../src/services/prisma", () => ({
  prisma: { predictionContest: { findMany: mocks.findMany }, user: { findUnique: vi.fn(async () => null) } },
}));

vi.mock("../src/modules/user/user.service", () => ({
  UserService: { findOrCreateUser: vi.fn(async () => ({ id: "user-1", telegramId: "100" })) },
}));

import { registerPredictionViews } from "../src/bot/views/prediction.views";
import { callbackFor, isValidCallbackData, renderPanel } from "../src/bot/navigation/panel-ui";

function ctx() {
  return {
    from: { id: 100 },
    session: {},
    reply: vi.fn(async (_text, _extra) => ({ message_id: 1 })),
  } as any;
}

async function render(id: Parameters<typeof renderPanel>[1]["id"], params: Record<string, string> = {}) {
  const fake = ctx();
  await renderPanel(fake, { id, params }, "replace");
  const calls = fake.reply.mock.calls;
  return { text: calls.at(-1)?.[0] as string, extra: calls.at(-1)?.[1] as any };
}

const buttons = (extra: any) => extra.reply_markup.inline_keyboard.flat();
const contest = (id: string, title: string, overrides: Record<string, any> = {}) => ({
  id,
  title,
  status: "open",
  closesAt: new Date("2030-06-25T13:00:00.000Z"),
  resultOptionId: null,
  _count: { entries: 3 },
  ...overrides,
});

beforeAll(() => {
  registerPredictionViews();
});

beforeEach(() => {
  findMany.mockReset();
});

describe("prediction navigation IA", () => {
  it("main page queries and shows only open participable predictions", async () => {
    findMany.mockResolvedValue([contest("open-1", "مسابقه فعال")]);

    const view = await render("prediction");

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { status: "open" },
      orderBy: { closesAt: "asc" },
    }));
    expect(view.text).toContain("🔮 پیش‌بینی مسابقات");
    expect(view.text).toContain("مسابقه فعال");
    const keyboardButtons = buttons(view.extra);
    expect(keyboardButtons.some((button: any) => button.text === "مسابقه فعال" && button.style === "primary")).toBe(true);
  });

  it("closed predictions do not appear on main page", async () => {
    findMany.mockResolvedValue([contest("open-1", "مسابقه فعال")]);

    const view = await render("prediction");

    expect(view.text).not.toContain("مسابقه بسته");
    expect(buttons(view.extra).some((button: any) => button.text === "مسابقه بسته")).toBe(false);
  });

  it("waiting-result page shows only waiting contests", async () => {
    findMany.mockResolvedValue([contest("wait-1", "منتظر نتیجه", { status: "closed", closesAt: new Date("2026-06-25T10:00:00.000Z") })]);

    const view = await render("prediction.waiting");

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ resultOptionId: null, status: { notIn: ["deleted", "archived"] } }),
    }));
    expect(view.text).toContain("📂 در انتظار نتیجه");
    expect(view.text).toContain("⏳ در انتظار اعلام نتیجه");
    expect(view.text).toContain("منتظر نتیجه");
  });

  it("announced page shows only announced/resulted contests", async () => {
    findMany.mockResolvedValue([contest("done-1", "نتیجه‌دار", { status: "announced", resultOptionId: "opt-1", resultOption: { title: "برد" } })]);

    const view = await render("prediction.results");

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { status: { in: ["resulted", "announced"] }, resultOptionId: { not: null } },
    }));
    expect(view.text).toContain("🏁 نتایج اعلام‌شده");
    expect(view.text).toContain("📣 نتیجه اعلام شده");
    expect(view.text).toContain("نتیجه: برد");
  });

  it("my predictions page shows only participated contests", async () => {
    findMany.mockResolvedValue([contest("mine-1", "شرکت‌کرده", { entries: [{ option: { title: "برد میزبان" } }] })]);

    const view = await render("prediction.history");

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { AND: [{ status: { notIn: ["deleted", "archived"] } }, { entries: { some: { userId: "user-1" } } }] },
    }));
    expect(view.text).toContain("🎯 پیش‌بینی‌های من");
    expect(view.text).toContain("انتخاب شما: برد میزبان");
  });

  it("archive page hides archived contests from users", async () => {
    const view = await render("prediction.archive");

    expect(findMany).not.toHaveBeenCalled();
    expect(view.text).toContain("📜 آرشیو");
    expect(view.text).toContain("در دسترس نیست");
  });

  it("empty main page still shows neutral navigation", async () => {
    findMany.mockResolvedValue([]);

    const view = await render("prediction");

    expect(view.text).toContain("در حال حاضر پیش‌بینی بازی فعالی وجود ندارد.");
    const navigationButtons = buttons(view.extra).filter((button: any) => /در انتظار نتیجه|نتایج اعلام‌شده|پیش‌بینی‌های من|آرشیو/.test(button.text));
    expect(navigationButtons).toHaveLength(4);
    expect(navigationButtons.every((button: any) => button.style === undefined)).toBe(true);
  });

  it("button styles remain correct", async () => {
    findMany.mockResolvedValue([contest("open-1", "مسابقه فعال")]);

    const view = await render("prediction");

    const keyboardButtons = buttons(view.extra);
    expect(keyboardButtons.find((button: any) => button.text === "مسابقه فعال")?.style).toBe("primary");
    expect(keyboardButtons.filter((button: any) => /در انتظار نتیجه|نتایج اعلام‌شده|پیش‌بینی‌های من|آرشیو/.test(button.text)).every((button: any) => button.style === undefined)).toBe(true);
  });

  it("callback data remains under Telegram limits", () => {
    const callbacks = [
      callbackFor("prediction"),
      callbackFor("prediction.waiting"),
      callbackFor("prediction.results"),
      callbackFor("prediction.history"),
      callbackFor("prediction.archive", { page: 12 }),
      callbackFor("prediction.detail", { contestId: "64f000000000000000000101" }),
    ];

    expect(callbacks.every(isValidCallbackData)).toBe(true);
  });
});
