import { describe, expect, test, vi } from "vitest";
import { acknowledgeCallbackImmediately, installCallbackAckGuard, answerCallback } from "../src/bot/callback-ack";

describe("callback acknowledgement guard", () => {
  test("answers a callback only once", async () => {
    const answerCbQuery = vi.fn().mockResolvedValue(true);
    const ctx: any = { callbackQuery: { id: "cb" }, answerCbQuery };

    installCallbackAckGuard(ctx);

    await acknowledgeCallbackImmediately(ctx);
    await answerCallback(ctx, "در حال پردازش...");
    await ctx.answerCbQuery("دسترسی غیرمجاز");

    expect(answerCbQuery).toHaveBeenCalledTimes(1);
  });
});
