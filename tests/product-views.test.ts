import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { registerProductViews } from "../src/bot/views/product.views";
import { callbackFor, renderPanel } from "../src/bot/navigation/panel-ui";
import { ProductService } from "../src/modules/product/product.service";

const categoryId = "64f000000000000000000001";
const productA = { id: "64f000000000000000000101", title: "سرویس طلایی", price: 120000 };
const productB = { id: "64f000000000000000000102", title: "سرویس نقره‌ای", price: 90000 };

function ctx() {
  return {
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

beforeAll(() => {
  registerProductViews();
});

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("user shop product views", () => {
  it("shows category description, product count, primary product buttons, and neutral navigation", async () => {
    vi.spyOn(ProductService, "getCategoryWithProducts").mockResolvedValue({
      id: categoryId,
      name: "VIP",
      description: "توضیح اختصاصی دسته",
      icon: "📁",
      products: [productA, productB],
    } as any);

    const view = await render("shop.products", { categoryId });

    expect(view.text).toContain("📁 VIP");
    expect(view.text).toContain("📝 توضیحات");
    expect(view.text).toContain("توضیح اختصاصی دسته");
    expect(view.text).toContain("📦 محصولات این دسته‌بندی");
    expect(view.text).toContain("برای مشاهده جزئیات، موجودی و خرید، یک سرویس را انتخاب کنید.");
    expect(view.text).toContain("تعداد سرویس‌ها: ۲");

    const keyboardButtons = buttons(view.extra);
    const productButtons = keyboardButtons.filter((button: any) => button.callback_data?.startsWith("nav:shop.product"));
    expect(productButtons).toHaveLength(2);
    expect(productButtons.every((button: any) => button.style === "primary")).toBe(true);
    expect(productButtons[0].text).toContain("📦 سرویس طلایی");

    const navigationButtons = keyboardButtons.filter((button: any) => /دسته‌بندی‌ها|برگشت|خانه/.test(button.text));
    expect(navigationButtons.length).toBeGreaterThanOrEqual(2);
    expect(navigationButtons.every((button: any) => button.style === undefined)).toBe(true);
  });

  it("does not show empty/null/undefined description text when category has no description", async () => {
    vi.spyOn(ProductService, "getCategoryWithProducts").mockResolvedValue({
      id: categoryId,
      name: "بدون توضیح",
      description: " undefined ",
      icon: null,
      products: [productA],
    } as any);

    const view = await render("shop.products", { categoryId });

    expect(view.text).not.toContain("📝 توضیحات");
    expect(view.text).not.toMatch(/undefined|null/);
    expect(view.text).toContain("تعداد سرویس‌ها: ۱");
  });

  it("shows a clean Persian empty state and usable empty-category actions", async () => {
    vi.spyOn(ProductService, "getCategoryWithProducts").mockResolvedValue({
      id: categoryId,
      name: "خالی",
      description: null,
      icon: "📁",
      products: [],
    } as any);

    const view = await render("shop.products", { categoryId });

    expect(view.text).toContain("فعلاً محصولی در این دسته‌بندی وجود ندارد.");
    expect(buttons(view.extra).map((button: any) => button.text)).toEqual(expect.arrayContaining(["🔙 دسته‌بندی‌ها", "🔎 جستجوی سرویس"]));
  });

  it("styles search result product buttons as primary", async () => {
    vi.spyOn(ProductService, "searchActiveProducts").mockResolvedValue([productA] as any);

    const view = await render("shop.searchResults", { q: "طلایی" });
    const productButton = buttons(view.extra).find((button: any) => button.callback_data?.startsWith("nav:shop.product"));

    expect(productButton.style).toBe("primary");
    expect(productButton.text).toContain("📦 سرویس طلایی");
  });

  it("styles recommended product buttons as primary", async () => {
    vi.spyOn(ProductService, "getCategories").mockResolvedValue([{ id: categoryId, name: "VIP", products: [productA] }] as any);

    const view = await render("shop.recommended");
    const productButton = buttons(view.extra).find((button: any) => button.callback_data?.startsWith("nav:shop.product"));

    expect(productButton.style).toBe("primary");
    expect(productButton.text).toContain("📦 سرویس طلایی");
  });

  it("keeps product callback_data under Telegram 64-byte limit", () => {
    const callback = callbackFor("shop.product", { productId: productA.id });
    expect(Buffer.byteLength(callback, "utf8")).toBeLessThanOrEqual(64);
  });
});
