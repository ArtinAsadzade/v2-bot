import { beforeEach, describe, expect, test, vi } from "vitest";
import { handleActiveFlowText, startFlow } from "../src/bot/flows/flow-engine";
import { registerView } from "../src/bot/navigation/panel-ui";
import { WorkflowTelemetryService } from "../src/services/workflow-telemetry.service";
import type { AppContext } from "../src/types/bot";

function ctx(): AppContext {
  const replies: any[] = [];
  return {
    session: { navigation: { stack: [{ id: "wallet" }] } },
    from: { id: 123 },
    reply: vi.fn(async (text: string, extra?: any) => { replies.push({ text, extra }); return {} as any; }),
    editMessageText: vi.fn(async () => ({})),
    telegram: { sendMessage: vi.fn(async () => ({})) },
    __replies: replies,
  } as any;
}

const texts = (c: any) => c.__replies.map((r: any) => String(r.text));

describe("workflow engine reliability", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    WorkflowTelemetryService.clearForTests();
    registerView("wallet", async () => ({ text: "کیف پول", keyboard: [] }));
    registerView("home", async () => ({ text: "خانه", keyboard: [] }));
  });

  test("creates a standardized expiring draft when a flow starts", async () => {
    const c = ctx();
    await startFlow(c, "product_search");

    expect(c.session.flow?.draft).toMatchObject({
      type: "product_search",
      currentStep: "query",
      data: {},
    });
    expect(Date.parse(c.session.flow!.draft!.expiresAt)).toBeGreaterThan(Date.now());
    expect(WorkflowTelemetryService.stats().byFlow.product_search.started).toBe(1);
  });

  test("recovers cleanly when the draft is missing", async () => {
    const c = ctx();
    await startFlow(c, "product_search");
    delete c.session.flow!.draft;

    const handled = await handleActiveFlowText(c, "premium");

    expect(handled).toBe(false);
    expect(c.session.flow).toBeUndefined();
    expect(texts(c).join("\n")).toContain("پیش‌نویس جریان پیدا نشد");
    expect(WorkflowTelemetryService.stats().byFlow.product_search.recovered).toBe(1);
  });

  test("expires stale drafts instead of continuing a corrupted workflow", async () => {
    const c = ctx();
    await startFlow(c, "product_search");
    c.session.flow!.draft!.expiresAt = new Date(Date.now() - 1000).toISOString();

    const handled = await handleActiveFlowText(c, "premium");

    expect(handled).toBe(false);
    expect(c.session.flow).toBeUndefined();
    expect(texts(c).join("\n")).toContain("منقضی شده است");
    expect(WorkflowTelemetryService.stats().byFlow.product_search.expired).toBe(1);
  });
});
